import type { Diagnosis } from "@/hooks/useCopilotStream";
import type { OrbState } from "thinking-orbs";

// Spoken filler while a diagnosis runs. These mirror the SSE steps the API
// already emits, so reassuring the user costs no extra model call.
export const ACK_LINE = "Got it. Working on that now.";
export const STEP_SPEECH: Record<string, string> = {
  "reading telemetry": "Pulling up the live machine data.",
  "retrieving manuals": "Going through the manuals.",
  generating: "Working out the diagnosis.",
};
export const ERROR_LINE = "Sorry, that diagnosis did not come through. Let's try that again.";
export const ORB_FOR_STEP: Record<string, OrbState> = {
  "reading telemetry": "connecting",
  "retrieving manuals": "searching",
  generating: "solving",
};

// Spoken gist of the answer. Reading the full structured answer takes minutes,
// so the summary leads with safety and gives the top cause and the first check,
// while the detail stays on screen for the user to read.
export function spokenSummary(a: Diagnosis): string {
  const parts: string[] = [];
  if (a.safety_warning) parts.push(`Stop. Safety check. ${a.safety_warning}`);
  if (a.freshness_warning) parts.push(a.freshness_warning);
  const top = a.hypotheses[0];
  if (top) parts.push(`Most likely: ${top.cause}.${top.supports ? ` Supported by: ${top.supports}` : ""}`);
  const first = a.next_checks[0];
  if (first) parts.push(`First check: ${first}`);
  const rest = a.next_checks.length - 1;
  if (rest > 0) parts.push(`${rest} more ${rest === 1 ? "check is" : "checks are"} on screen.`);
  return parts.join("\n\n");
}

// Well under the API ceiling, and short enough that the first line starts
// playing quickly while the rest is still being synthesised.
const CHUNK_CHARS = 900;

export function chunkForSpeech(text: string, limit = CHUNK_CHARS): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .flatMap((s) => (s.length > limit ? s.match(new RegExp(`.{1,${limit}}(\\s|$)`, "g")) ?? [s] : [s]));
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > limit) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function fetchSpeech(text: string, signal: AbortSignal) {
  const res = await fetch("/api/v1/speech/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error("tts_failed");
  return URL.createObjectURL(await res.blob());
}

// Resolves false when the browser refused to play it, so a blocked player can
// never fail silently again.
function play(url: string, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    const audio = new Audio(url);
    const finish = (played: boolean) => {
      signal.removeEventListener("abort", stop);
      resolve(played);
    };
    const stop = () => {
      audio.pause();
      resolve(false);
    };
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    signal.addEventListener("abort", stop, { once: true });
    void audio.play().catch((err) => {
      // A blob: URL still needs media-src to permit blob:, otherwise the
      // element errors out with no sound and no visible failure.
      console.warn("[voice] playback failed:", err);
      finish(false);
    });
  });
}

// Play the lines in order, fetching the next chunk while the current one is
// still speaking so there is no silence between them.
export async function speakTexts(
  texts: string[],
  {
    signal,
    onCaption,
    onFailure,
  }: { signal: AbortSignal; onCaption?: (text: string) => void; onFailure?: () => void },
) {
  const chunks = texts.flatMap((t) => chunkForSpeech(t));
  if (!chunks.length) return;
  const urls: string[] = [];
  let reported = false;
  let pending = fetchSpeech(chunks[0], signal);
  try {
    for (let i = 0; i < chunks.length && !signal.aborted; i++) {
      const url = await pending;
      urls.push(url);
      if (i + 1 < chunks.length) pending = fetchSpeech(chunks[i + 1], signal);
      onCaption?.(chunks[i]);
      const played = await play(url, signal);
      if (!played && !signal.aborted && !reported) {
        reported = true;
        onFailure?.();
      }
    }
  } finally {
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
}
