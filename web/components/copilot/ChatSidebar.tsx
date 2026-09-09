"use client";

import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { useCopilotStream } from "@/hooks/useCopilotStream";
import { ChatMessage } from "./ChatMessage";
import { CitationPill } from "./CitationPill";

const PRESETS = ["Why is the front heater cold?", "Diagnose fault code 32014", "What checks before touching SSR 2?"];

export function ChatSidebar({ machineKey }: { machineKey: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { busy, status, citations, answer, error, ask } = useCopilotStream(machineKey);

  if (!open)
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 font-medium shadow-[0_8px_32px_rgba(16,185,129,0.28)]">
        <Bot size={18} /> Copilot
      </button>
    );
  return (
    <aside className="fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-md flex-col border-l border-white/10 bg-[#111418]/92 backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-white/10 p-3">
        <b>Diagnostic Copilot</b>
        <button onClick={() => setOpen(false)} className="text-zinc-400">✕</button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {citations.map((c, i) => <CitationPill key={i} c={c} />)}
          </div>
        )}
        {status && <p className="text-sm text-zinc-400">{status}</p>}
        {answer && <ChatMessage answer={answer} />}
        {error && <p className="text-sm text-red-300">{error === "diagnostic_unavailable" ? "Diagnosis unavailable — telemetry and manuals still work. Try again." : error}</p>}
      </div>
      <div className="space-y-2 border-t border-zinc-800 p-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => { setInput(p); ask(p); }}
              className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{p}</button>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (input.trim() && !busy) ask(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this machine…"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm" />
          <button disabled={busy || !input.trim()} className="rounded bg-emerald-600 px-3 disabled:opacity-50">
            <Send size={16} />
          </button>
        </form>
      </div>
    </aside>
  );
}
