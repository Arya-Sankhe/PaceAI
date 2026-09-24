"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { demoMode } from "@/lib/api";

export interface Citation { document_id: string; revision: string; page_number: number }
export interface Diagnosis {
  observed_facts: string[]; hypotheses: { cause: string; supports: string; conflicts: string }[];
  next_checks: string[]; safety_warning: string; freshness_warning: string;
  speech_summary: string; language_code: string; citations: Citation[];
}

// Minimal SSE-over-POST reader. Only the copilot streams; everything else is plain fetch.
export function useCopilotStream(machineKey: string) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [step, setStep] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [answer, setAnswer] = useState<Diagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  async function ask(message: string, language?: string) {
    setBusy(true); setStatus(""); setStep(""); setCitations([]); setAnswer(null); setError(null);
    try {
      const { data } = demoMode ? { data: { session: null } } : await supabase().auth.getSession();
      const res = await fetch(`/api/v1/machines/${machineKey}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify({ message, ...(conversationId ? { conversation_id: conversationId } : {}), ...(language ? { language } : {}) }),
      });
      if (!res.ok || !res.body) throw new Error("chat_failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", raw = "";
      const STEP: Record<string, string> = {
        "reading telemetry": "Reading telemetry…",
        "retrieving manuals": "Retrieving manuals…",
        generating: "Generating diagnosis…",
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (\w+)\ndata: ([\s\S]*)$/.exec(block);
          if (!ev) continue;
          const data = JSON.parse(ev[2]);
          if (ev[1] === "status") { setStep(data); setStatus(STEP[data] ?? data); }
          else if (ev[1] === "citation") setCitations((c) => [...c, data]);
          else if (ev[1] === "delta") raw += data;
          else if (ev[1] === "completed") { setConversationId(data.conversation_id ?? null); setAnswer(data.answer); }
          else if (ev[1] === "error") throw new Error(data);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "chat_failed");
    } finally {
      setBusy(false);
      setStatus("");
      setStep("");
    }
  }

  return { busy, status, step, citations, answer, error, conversationId, ask };
}
