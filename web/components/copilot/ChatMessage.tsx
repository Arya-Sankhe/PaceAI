"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Diagnosis } from "@/hooks/useCopilotStream";
import { CitationPill } from "./CitationPill";
import { SafetyBanner } from "./SafetyBanner";
import { FreshnessWarning } from "./FreshnessWarning";

// ponytail: react-markdown WITHOUT rehype-raw — raw HTML from the model is rendered as text, not DOM.
export function ChatMessage({ answer }: { answer: Diagnosis }) {
  return (
    <div className="space-y-3 text-sm">
      <SafetyBanner text={answer.safety_warning} />
      <FreshnessWarning text={answer.freshness_warning} />
      {answer.observed_facts.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold text-zinc-300">Observed facts</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-zinc-200">
            {answer.observed_facts.map((f, i) => <li key={i}><Md text={f} /></li>)}
          </ul>
        </section>
      )}
      {answer.hypotheses.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold text-zinc-300">Ranked hypotheses</h4>
          <ol className="list-decimal space-y-1 pl-5">
            {answer.hypotheses.map((h, i) => (
              <li key={i}>
                <Md text={h.cause} />
                {h.supports && <div className="text-emerald-300/90">✓ <Md text={h.supports} /></div>}
                {h.conflicts && <div className="text-red-300/90">✗ <Md text={h.conflicts} /></div>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {answer.next_checks.length > 0 && (
        <section>
          <h4 className="mb-1 font-semibold text-zinc-300">Next checks</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-zinc-200">
            {answer.next_checks.map((c, i) => <li key={i}><Md text={c} /></li>)}
          </ul>
        </section>
      )}
      {answer.citations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {answer.citations.map((c, i) => <CitationPill key={i} c={c} />)}
        </div>
      )}
    </div>
  );
}

function Md({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;
}
