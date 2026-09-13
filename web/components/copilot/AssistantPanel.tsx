"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import type { OrbState } from "thinking-orbs";
import { ScaledOrb } from "@/components/copilot/ScaledOrb";
import { useCopilotStream } from "@/hooks/useCopilotStream";
import { useProgressiveAnswer } from "@/hooks/useProgressiveAnswer";
import { ChatMessage } from "@/components/copilot/ChatMessage";

const PRESETS = [
  "Why is the front heater cold?",
  "Diagnose fault code 32014",
  "What checks before touching SSR 2?",
];

// The stream reports raw steps; give each one an orb verb that reads like it.
const ORB_FOR_STEP: Record<string, OrbState> = {
  "reading telemetry": "connecting",
  "retrieving manuals": "searching",
  generating: "solving",
};

// Draw the dense 64px design down to this footprint, so the space is filled
// with more dots rather than the sparse 20px design's dots being enlarged.
const INLINE_ORB_PX = 50;
const COLUMN = "mx-auto w-full max-w-[900px]";

const BOTTOM_SLACK = 48;

export function AssistantPanel({ machineKey }: { machineKey: string }) {
  const [input, setInput] = useState("");
  const { busy, status, step, answer, error, ask } = useCopilotStream(machineKey);
  const { answer: shown, streaming } = useProgressiveAnswer(answer);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-follow the growing answer until the reader scrolls away; re-arms when
  // they return to the bottom, or when they ask a new question.
  const follow = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !follow.current) return;
    el.scrollTop = el.scrollHeight;
  }, [shown, streaming, status, busy]);

  // Our own scrolls always land at the bottom, so anything short of the bottom
  // can only be the reader — no need to guess at wheel/touch intent.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    follow.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
  };

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    follow.current = true;
    ask(text);
    setInput("");
  };

  const empty = !answer && !status && !error && !busy;
  const orbState: OrbState = ORB_FOR_STEP[step] ?? "working";

  const composer = (
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
        type="submit"
        disabled={busy || !input.trim()}
        aria-label="Send"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-25 disabled:hover:scale-100"
      >
        <Send size={15} aria-hidden="true" />
      </button>
    </form>
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
              {(status || busy) && (
                <p className="flex items-center gap-3 text-[13.5px] text-white/55">
                  {/* the status text beside it already announces the step */}
                  <ScaledOrb state={orbState} size={64} scale={INLINE_ORB_PX / 64} />
                  {status || "Thinking…"}
                </p>
              )}
              {shown && <ChatMessage answer={shown} />}
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
    </section>
  );
}
