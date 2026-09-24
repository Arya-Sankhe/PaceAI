"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrbState } from "thinking-orbs";
import type { DictationStatus } from "@/hooks/useDictation";
import { ORB_FOR_STEP, chromeFor, ttsLanguage } from "@/lib/voice";

export type VoicePhase = "connecting" | "listening" | "thinking";

type Args = {
  active: boolean;
  ask: (text: string, language?: string) => void;
  busy: boolean;
  step: string;
  error: string | null;
  micStatus: DictationStatus;
  micStart: () => Promise<void> | void;
  micStop: (opts?: { discard?: boolean }) => void;
  say: (texts: string[], preempt?: boolean, language?: string) => Promise<void>;
};

// The listening half of the voice agent. It owns the mic turn and the spoken
// progress fillers; the answer is handed back to the panel, which speaks the
// summary and returns the screen to the chat.
//
// The mic closes while the model works, so the agent never transcribes its own
// speech back into the conversation. Progress comes from the SSE steps the API
// already emits, so the fillers cost nothing extra and match what the UI shows.
export function useVoiceAgent({
  active,
  ask,
  busy,
  step,
  error,
  micStatus,
  micStart,
  micStop,
  say,
}: Args) {
  const [transcript, setTranscript] = useState("");
  const live = useRef(false);
  const accepting = useRef(false);

  const listening = micStatus === "listening";
  // Only a fresh turn is accepted: a trailing final flushed out after a turn
  // was already sent would otherwise start a second diagnosis.
  const acceptingNow = active && !busy && listening;
  useEffect(() => {
    accepting.current = acceptingNow;
  }, [acceptingNow]);

  // The turn's language, taken from the transcript the recogniser tagged, so
  // every filler — spoken before any answer exists — is in the user's language.
  const turnLang = useRef(ttsLanguage());

  useEffect(() => {
    if (!active) return;
    live.current = true;
    turnLang.current = ttsLanguage();
    setTranscript("");
    void micStart();
    return () => {
      live.current = false;
      // Drop the transcript the shutdown itself flushes out.
      micStop({ discard: true });
    };
  }, [active, micStart, micStop]);

  // One spoken line per step, so the fillers never talk over each other.
  const lastStep = useRef("");
  useEffect(() => {
    if (!active) return;
    if (!step) {
      lastStep.current = "";
      return;
    }
    if (step === lastStep.current) return;
    lastStep.current = step;
    const chrome = chromeFor(turnLang.current);
    void say([chrome.steps[step] ?? chrome.working], false, turnLang.current);
  }, [active, step, say]);

  // A failed diagnosis is not an answer: say so and listen again.
  const failed = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !error || failed.current === error) return;
    failed.current = error;
    void say([chromeFor(turnLang.current).error], true, turnLang.current).then(() => {
      if (live.current) void micStart();
    });
  }, [active, error, say, micStart]);

  const handleUtterance = useCallback(
    (text: string, language?: string) => {
      if (!accepting.current || !text.trim()) return;
      turnLang.current = ttsLanguage(language);
      setTranscript(text);
      micStop();
      void say([chromeFor(turnLang.current).ack], true, turnLang.current);
      ask(text, language);
    },
    [ask, micStop, say],
  );

  const phase: VoicePhase = busy ? "thinking" : listening ? "listening" : "connecting";
  const orb: OrbState = busy ? (ORB_FOR_STEP[step] ?? "working") : listening ? "listening" : "connecting";

  return { phase, orb, transcript, handleUtterance };
}
