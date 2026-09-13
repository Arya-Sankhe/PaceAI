"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DictationStatus = "idle" | "starting" | "listening";

type ServerEvent = { event?: string; text?: string; message?: string };

// Audio captured while the socket is still connecting is held here rather than
// dropped, so the first words of a sentence survive the handshake.
const MAX_BACKLOG = 100; // ~10s

// Ask the worklet for its partially filled chunk so the tail of the last word
// is sent instead of being thrown away with the audio graph.
function flushWorklet(worklet: AudioWorkletNode, ws: WebSocket) {
  return new Promise<void>((resolve) => {
    const settle = (data: ArrayBuffer | null) => {
      worklet.port.onmessage = null;
      if (data && data.byteLength > 0 && ws.readyState === WebSocket.OPEN) ws.send(data);
      resolve();
    };
    const timer = setTimeout(() => settle(null), 150);
    worklet.port.onmessage = (event) => {
      clearTimeout(timer);
      settle(event.data as ArrayBuffer);
    };
    worklet.port.postMessage({ flush: true });
  });
}

// Dictation over Sarvam's realtime streaming socket, relayed by our API so the
// subscription key stays server-side. The socket has no session length cap
// (unlike Sarvam's 30s REST endpoint) and needs raw 16kHz PCM, so audio is
// captured with an AudioWorklet rather than MediaRecorder.
export function useDictation(onFinal: (text: string) => void) {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const context = useRef<AudioContext | null>(null);
  const media = useRef<MediaStream | null>(null);
  const worklet = useRef<AudioWorkletNode | null>(null);
  // Set when the caller is shutting the session down and does not want the
  // trailing transcript it flushes out.
  const discard = useRef(false);

  // Read the transcript callback through a ref so start/stop keep a stable
  // identity for callers that drive them from effects.
  const finalRef = useRef(onFinal);
  useEffect(() => {
    finalRef.current = onFinal;
  });

  const teardownAudio = useCallback(() => {
    worklet.current = null;
    context.current?.close().catch(() => {});
    context.current = null;
    media.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
    setPartial("");
  }, []);

  const stop = useCallback(
    (opts?: { discard?: boolean }) => {
      discard.current = !!opts?.discard;
      const ws = socket.current;
      const node = worklet.current;
      setStatus("idle");
      if (!ws || ws.readyState !== WebSocket.OPEN || !node) {
        ws?.close();
        teardownAudio();
        return;
      }
      // Send the worklet's residual audio, then tell the server we are done. It
      // keeps the socket open until the last transcript comes back.
      void flushWorklet(node, ws).then(() => {
        teardownAudio();
        ws.send(JSON.stringify({ event: "stop" }));
      });
    },
    [teardownAudio],
  );

  const start = useCallback(async () => {
    if (socket.current) return;
    discard.current = false;
    setError(null);
    setPartial("");
    setStatus("starting");
    try {
      media.current = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext({ sampleRate: 16000 });
      context.current = ctx;
      await ctx.audioWorklet.addModule("/pcm-worklet.js");

      // Capture before connecting. The Sarvam handshake takes a few hundred ms
      // and anything spoken during it would otherwise never be sent at all.
      let ws: WebSocket | null = null;
      const backlog: ArrayBuffer[] = [];
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      worklet.current = node;
      node.port.onmessage = (event) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(event.data);
        else if (backlog.length < MAX_BACKLOG) backlog.push(event.data);
      };
      ctx.createMediaStreamSource(media.current).connect(node);
      node.connect(ctx.destination); // silent: the worklet writes no output
      setStatus("listening");

      const next = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/v1/speech/stream`,
      );
      ws = next;
      socket.current = next;
      next.binaryType = "arraybuffer";
      next.onmessage = (event) => {
        let message: ServerEvent;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.event === "transcript.partial") setPartial(message.text ?? "");
        else if (message.event === "transcript.final") {
          setPartial("");
          if (message.text && !discard.current) finalRef.current(message.text);
        } else if (message.event === "error") setError(message.message ?? "speech_failed");
      };
      next.onclose = () => {
        socket.current = null;
        setStatus("idle");
      };
      await new Promise<void>((resolve, reject) => {
        next.onopen = () => resolve();
        next.onerror = () => reject(new Error("socket_failed"));
      });

      // Replay whatever was spoken while the socket was coming up, then stream.
      for (const chunk of backlog) next.send(chunk);
      backlog.length = 0;
    } catch (e) {
      socket.current?.close();
      socket.current = null;
      teardownAudio();
      setStatus("idle");
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone access is blocked."
          : "Could not start dictation.",
      );
    }
  }, [teardownAudio]);

  useEffect(
    () => () => {
      socket.current?.close();
      teardownAudio();
    },
    [teardownAudio],
  );

  return {
    status,
    partial,
    error,
    start,
    stop,
    toggle: () => (status === "idle" ? start() : stop()),
  };
}
