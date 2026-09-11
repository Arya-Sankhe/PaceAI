"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { useCopilotStream } from "@/hooks/useCopilotStream";
import { ChatMessage } from "@/components/copilot/ChatMessage";
import { CitationPill } from "@/components/copilot/CitationPill";

const PRESETS = [
  "Why is the front heater cold?",
  "Diagnose fault code 32014",
  "What checks before touching SSR 2?",
];

export function AssistantPanel({ machineKey }: { machineKey: string }) {
  const [input, setInput] = useState("");
  const { busy, status, citations, answer, error, ask } = useCopilotStream(machineKey);
  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    ask(text);
    setInput("");
  };

  return (
    <div className="black-card !rounded-[22px]">
      <div className="relative z-10">
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4 sm:px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black shadow-[0_0_24px_rgba(255,255,255,0.3)]">
            <Sparkles size={16} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-white">
              Diagnostic assistant
              <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 align-middle text-[9.5px] font-bold uppercase tracking-wide text-white/60">AI</span>
            </h2>
            <p className="text-[12.5px] text-white/50">Grounded in live telemetry and the manual.</p>
          </div>
          {busy && (
            <span className="ml-auto flex items-center gap-2 text-[12px] font-medium text-white/50">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white/70" /> Thinking…
            </span>
          )}
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          {!answer && !status && !error && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 text-center">
              <p className="mx-auto max-w-[42ch] text-[13.5px] leading-relaxed text-white/60">
                Ask about a fault, a heater that won&apos;t reach temperature, or a safe check before touching a
                component.
              </p>
              <div className="mt-3.5 flex flex-wrap justify-center gap-2">
                {PRESETS.map((p) => (
                  <button key={p} onClick={() => submit(p)}
                    className="rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] font-medium text-white/80 transition-all hover:border-white/25 hover:bg-white hover:text-black active:scale-95">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {citations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {citations.map((c, i) => <CitationPill key={i} c={c} />)}
            </div>
          )}
          {status && (
            <p className="flex items-center gap-2 text-[13.5px] text-white/55">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white/60" /> {status}
            </p>
          )}
          {answer && (
            <div className="enter rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4 sm:p-5">
              <ChatMessage answer={answer} />
            </div>
          )}
          {error && (
            <p className="rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-[13.5px] text-red-100">
              {error === "diagnostic_unavailable"
                ? "Diagnosis unavailable — telemetry and manuals still work. Try again."
                : error}
            </p>
          )}
        </div>

        <form
          className="flex gap-2 border-t border-white/[0.08] bg-black/40 px-4 py-3 sm:px-5"
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this machine…"
            aria-label="Ask about this machine"
            className="w-full rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-[13.5px] text-white outline-none placeholder:text-white/35 focus:border-white/35 focus:bg-white/[0.09]"
          />
          <button
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.25)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
