"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AudioLines, Mic, Send } from "lucide-react";
import { ScaledOrb } from "@/components/copilot/ScaledOrb";
import { ChatMessage } from "@/components/copilot/ChatMessage";
import { VoiceMode } from "@/components/copilot/VoiceMode";
import { useCopilotStream, type Diagnosis } from "@/hooks/useCopilotStream";
import { useDictation } from "@/hooks/useDictation";
import { useProgressiveAnswer } from "@/hooks/useProgressiveAnswer";
import { useSpeech } from "@/hooks/useSpeech";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import { ORB_FOR_STEP, spokenSummary } from "@/lib/voice";

const PRESETS = [
  "Why is the front heater cold?",
  "Diagnose fault code 32014",
  "What checks before touching SSR 2?",
];

// Draw the dense 64px design down to this footprint, so the space is filled
// with more dots rather than the sparse 20px design's dots being enlarged.
const INLINE_ORB_PX = 50;
const COLUMN = "mx-auto w-full max-w-[900px]";

const BOTTOM_SLACK = 48;
// Matches the .voice-layer--out / .voice-orb-shrink duration in globals.css.
const CLOSE_MS = 260;

export function AssistantPanel({ machineKey }: { machineKey: string }) {
  const [input, setInput] = useState("");
  const [voice, setVoice] = useState(false);
  const [closing, setClosing] = useState(false);
  const { busy, status, step, answer, error, ask } = useCopilotStream(machineKey);
  const { answer: shown, streaming } = useProgressiveAnswer(answer);
  const { say, stop: stopSpeech, playing, caption: spokenCaption, blocked } = useSpeech();

  // One mic, two meanings: in voice mode a transcript is a turn to answer, and
  // otherwise it is dictation into the composer. Dispatch through a ref so the
  // mic's start/stop stay stable and always see the current mode.
  const inVoice = useRef(false);
  const dispatch = useRef<(text: string, language?: string) => void>(() => {});
  const onFinal = useCallback((text: string, language?: string) => dispatch.current(text, language), []);
  const mic = useDictation(onFinal);
  // Whether the question in flight was spoken, so a typed question is never
  // read back aloud.
  const spokenQuestion = useRef(false);

  // The Q&A thread: each new question parks the previous answer above the live
  // one so the reader can scroll back, while the newest turn keeps its reveal.
  const [history, setHistory] = useState<{ question: string; answer: Diagnosis }[]>([]);
  const [asked, setAsked] = useState("");
  const latest = useRef<Diagnosis | null>(null);
  useEffect(() => {
    if (answer) latest.current = answer;
  }, [answer]);

  const askThreaded = useCallback(
    (text: string, language?: string) => {
      const previous = latest.current;
      if (previous) setHistory((h) => [...h, { question: asked, answer: previous }]);
      setAsked(text);
      void ask(text, language);
    },
    [ask, asked],
  );

  const agent = useVoiceAgent({
    active: voice,
    ask: askThreaded,
    busy,
    step,
    error,
    micStatus: mic.status,
    micStart: mic.start,
    micStop: mic.stop,
    say,
  });

  useEffect(() => {
    inVoice.current = voice;
    dispatch.current = (text, language) => {
      if (inVoice.current) {
        spokenQuestion.current = true;
        agent.handleUtterance(text, language);
      } else {
        setInput((current) => (current.trim() ? `${current.trim()} ${text}` : text));
      }
    };
  });

  const closeVoice = useCallback(
    (cancelSpeech = false) => {
      if (cancelSpeech) {
        stopSpeech();
        // A cancelled turn is never spoken: the diagnosis still lands in the
        // chat, but it must not yank the overlay back open to say it.
        spokenQuestion.current = false;
      }
      setClosing(true);
      window.setTimeout(() => {
        setVoice(false);
        setClosing(false);
      }, CLOSE_MS);
    },
    [stopSpeech],
  );

  // The answer is ready: speak the gist and hand the screen back to the chat,
  // which streams the full detail. The speech outlives the overlay, so it keeps
  // playing as the orb shrinks away.
  const spoken = useRef<Diagnosis | null>(null);
  useEffect(() => {
    if (!answer || spoken.current === answer) return;
    spoken.current = answer;
    if (!spokenQuestion.current) return;
    spokenQuestion.current = false;
    const speech = spokenSummary(answer);
    if (speech) void say([speech], true, answer.language_code);
    closeVoice();
  }, [answer, say, closeVoice]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-follow the growing answer until the reader scrolls away; re-arms when
  // they return to the bottom, or when they ask a new question.
  const follow = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !follow.current) return;
    el.scrollTop = el.scrollHeight;
  }, [shown, streaming, status, busy, asked, history.length]);

  // Our own scrolls always land at the bottom, so anything short of the bottom
  // can only be the reader — no need to guess at wheel/touch intent.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    follow.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
  };

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    spokenQuestion.current = false;
    stopSpeech();
    follow.current = true;
    askThreaded(text);
    setInput("");
  };

  const empty = history.length === 0 && !answer && !status && !error && !busy;
  const dictating = !voice && mic.status !== "idle";
  const canSend = input.trim().length > 0;

  const composer = (
    <div>
      {(dictating || mic.error) && (
        <div className="mb-2 flex items-center gap-2 px-2 text-[13px]">
          {dictating && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#ff5d5d]" />}
          <span className={`truncate ${mic.error ? "text-[#ff9a9a]" : "text-white/50"}`}>
            {mic.error ||
              mic.partial ||
              (mic.status === "starting" ? "Connecting microphone…" : "Listening…")}
          </span>
        </div>
      )}
      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this machine…"
          aria-label="Ask about this machine"
          className="min-w-0 flex-1 bg-transparent px-1 text-[16px] text-white outline-none placeholder:text-white/35 sm:text-[15px]"
        />
        <button
          type="button"
          onClick={mic.toggle}
          aria-label={dictating ? "Stop dictation" : "Dictate your question"}
          aria-pressed={dictating}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all ${
            dictating
              ? "border-[#ff5d5d]/40 bg-[#ff5d5d]/15 text-[#ff8a8a]"
              : "border-white/10 bg-white/[0.06] text-white/70 hover:border-white/25 hover:text-white"
          }`}
        >
          <Mic size={15} aria-hidden="true" />
        </button>
        {/* Empty composer offers the voice agent; typing swaps in send. */}
        {canSend ? (
          <button
            type="submit"
            disabled={busy}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-25 disabled:hover:scale-100"
          >
            <Send size={15} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setVoice(true)}
            aria-label="Start the voice agent"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95"
          >
            <AudioLines size={15} aria-hidden="true" />
          </button>
        )}
      </form>
    </div>
  );

  return (
    <section aria-label="Diagnostic assistant" className="assistant-surface">
      {/* the desktop rail is hidden below lg, so the surface carries its own way out */}
      <div className="flex items-center px-5 pt-5 lg:hidden">
        <Link
          href={`/machines/${machineKey}?tab=overview`}
          className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[13px] font-semibold text-white/75 transition-colors hover:text-white"
        >
          ← Back to cockpit
        </Link>
      </div>

      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
          <div className={`assistant-rise ${COLUMN}`}>
            {/* decorative: the copy below carries the meaning, so keep it out of the a11y tree */}
            <div className="mb-5 flex justify-center">
              <ScaledOrb state="composing" size={64} scale={2.5} />
            </div>
            <p className="mx-auto mb-6 max-w-[46ch] text-center text-[14px] leading-relaxed text-white/55">
              Ask about a fault, a heater that won&apos;t reach temperature, or a safe check before touching a
              component.
            </p>
            {composer}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => submit(p)}
                  className="rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] font-medium text-white/80 transition-all hover:border-white/25 hover:bg-white hover:text-black active:scale-95"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="assistant-rise min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-8"
          >
            <div className={`${COLUMN} space-y-5`}>
              {history.map((turn, i) => (
                <div key={i} className="space-y-5">
                  <QuestionLine text={turn.question} />
                  <ChatMessage answer={turn.answer} machineKey={machineKey} />
                </div>
              ))}
              {asked && <QuestionLine text={asked} />}
              {/* Only visible once the voice overlay has handed the screen back. */}
              {blocked && (
                <p className="text-[12.5px] text-[#ff9a9a]">
                  Speech could not be played. Check autoplay and media permissions for this site and
                  your network connection.
                </p>
              )}
              {playing && (
                <div className="flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.05] py-1.5 pl-3 pr-2 text-[12.5px] text-white/55">
                  <AudioLines size={13} aria-hidden="true" className="text-white/70" />
                  Reading the summary
                  <button
                    type="button"
                    onClick={stopSpeech}
                    className="ml-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Stop
                  </button>
                </div>
              )}
              {(status || busy) && (
                <p className="flex items-center gap-3 text-[13.5px] text-white/55">
                  {/* the status text beside it already announces the step */}
                  <ScaledOrb state={ORB_FOR_STEP[step] ?? "working"} size={64} scale={INLINE_ORB_PX / 64} />
                  {status || "Thinking…"}
                </p>
              )}
              {shown && <ChatMessage answer={shown} machineKey={machineKey} />}
              {error && (
                <p className="rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-[13.5px] text-red-100">
                  {error === "diagnostic_unavailable"
                    ? "Diagnosis unavailable — telemetry and manuals still work. Try again."
                    : error}
                </p>
              )}
            </div>
          </div>
          <div className="px-6 pb-7 pt-1">
            <div className={COLUMN}>{composer}</div>
          </div>
        </div>
      )}

      {/* Overlaid rather than swapped, so its opaque background fades over the
          chat and reads as the content dissolving while the orb grows. */}
      {(voice || closing) && (
        <VoiceMode
          phase={agent.phase}
          orb={agent.orb}
          caption={
            agent.phase === "listening"
              ? mic.partial || "Listening…"
              : spokenCaption || agent.transcript
          }
          closing={closing}
          onClose={() => closeVoice(true)}
        />
      )}
    </section>
  );
}

// The reader's own question as a quiet right-aligned pill: the thread needs a
// marker for where each answer begins, but the answer is the content.
function QuestionLine({ text }: { text: string }) {
  return (
    <p className="flex justify-end">
      <span className="max-w-[85%] rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-[13px] text-white/60">
        {text}
      </span>
    </p>
  );
}
