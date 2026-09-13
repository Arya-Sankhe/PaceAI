"use client";

import { useEffect, useState } from "react";
import type { Diagnosis } from "@/hooks/useCopilotStream";

// The API validates the entire structured diagnosis before it sends anything
// (and the model answers in JSON rather than prose), so there is no token
// stream to render. This reveals the finished answer at a steady reading pace
// so it lands the way a stream does, and never reveals a field before the
// safety banner above it.
const CHARS_PER_SECOND = 520;
const MAX_MS = 6000;
const STEPS = 200;

function bodyLength(a: Diagnosis) {
  return (
    a.observed_facts.join("").length +
    a.hypotheses.reduce((n, h) => n + h.cause.length + h.supports.length + h.conflicts.length, 0) +
    a.next_checks.join("").length
  );
}

// Walk the body in display order, spending `budget` characters. Whatever the
// budget does not reach is dropped, so the answer builds up rather than
// settling from full text.
function visibleUpTo(a: Diagnosis, budget: number): Diagnosis {
  let left = budget;
  const take = (s: string) => {
    if (left <= 0) return "";
    if (s.length <= left) {
      left -= s.length;
      return s;
    }
    const head = s.slice(0, left);
    left = 0;
    return head;
  };

  const observed_facts = a.observed_facts.map(take).filter(Boolean);
  const hypotheses: Diagnosis["hypotheses"] = [];
  for (const h of a.hypotheses) {
    if (left <= 0) break;
    hypotheses.push({ ...h, cause: take(h.cause), supports: take(h.supports), conflicts: take(h.conflicts) });
  }
  const next_checks = a.next_checks.map(take).filter(Boolean);

  // Sources land with the finished answer, never ahead of the text they cite.
  return { ...a, observed_facts, hypotheses, next_checks, citations: left <= 0 ? a.citations : [] };
}

export function useProgressiveAnswer(answer: Diagnosis | null) {
  const [progress, setProgress] = useState<{ target: Diagnosis | null; budget: number }>({
    target: null,
    budget: 0,
  });

  useEffect(() => {
    if (!answer) return;
    const chars = bodyLength(answer);
    const duration = Math.min(MAX_MS, (chars / CHARS_PER_SECOND) * 1000);
    const step = Math.max(1, Math.ceil(chars / STEPS));
    const started = performance.now();
    let raf = 0;
    let last = -1;

    const tick = (now: number) => {
      const p = duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
      const budget = p >= 1 ? chars : Math.round((chars * p) / step) * step;
      if (budget !== last) {
        last = budget;
        setProgress({ target: answer, budget });
      }
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [answer]);

  if (!answer) return { answer: null as Diagnosis | null, streaming: false };

  // Keyed to the answer so a new one starts at zero on its first render
  // instead of flashing the previous answer's progress.
  const budget = progress.target === answer ? progress.budget : 0;
  const total = bodyLength(answer);

  return {
    answer: budget >= total ? answer : visibleUpTo(answer, budget),
    streaming: budget < total,
  };
}
