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
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-black/[0.06] px-5 py-4 sm:px-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1d1d1f] text-white">
          <Sparkles size={16} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-[15px] font-semibold tracking-tight">Diagnostic assistant</h2>
          <p className="text-[12.5px] text-[#6e6e73]">Grounded in live telemetry and the machine manual.</p>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        {!answer && !status && !error && (
          <div className="rounded-2xl bg-black/[0.03] p-5 text-center">
            <p className="text-[13.5px] text-[#515154]">
              Ask about a fault, a heater that won&apos;t reach temperature, or a safe check before touching a component.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {PRESETS.map((p) => (
                <button key={p} onClick={() => submit(p)}
                  className="rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-[#1d1d1f] hover:bg-black/[0.03]">
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
        {status && <p className="text-[13.5px] text-[#6e6e73]">{status}</p>}
        {answer && (
          <div className="rounded-2xl border border-black/[0.06] p-4">
            <ChatMessage answer={answer} />
          </div>
        )}
        {error && (
          <p className="rounded-2xl bg-[#d70015]/[0.06] px-4 py-3 text-[13.5px] text-[#d70015]">
            {error === "diagnostic_unavailable"
              ? "Diagnosis unavailable — telemetry and manuals still work. Try again."
              : error}
          </p>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-black/[0.06] bg-[#fbfbfc] px-4 py-3 sm:px-5"
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this machine…"
          className="w-full rounded-full border border-black/10 bg-white px-4 py-2.5 text-[13.5px] outline-none placeholder:text-[#6e6e73] focus:border-[#0071e3]"
        />
        <button
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1d1d1f] text-white disabled:opacity-40"
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
