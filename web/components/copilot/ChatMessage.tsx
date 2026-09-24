"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Diagnosis } from "@/hooks/useCopilotStream";
import { AnswerVisual } from "./AnswerVisual";
import { CitationPill } from "./CitationPill";
import { SafetyBanner } from "./SafetyBanner";
import { FreshnessWarning } from "./FreshnessWarning";

// ponytail: react-markdown WITHOUT rehype-raw — raw HTML from the model is rendered as text, not DOM.
export function ChatMessage({ answer, machineKey }: { answer: Diagnosis; machineKey: string }) {
  return (
    <div className="space-y-7 text-[14px] leading-[1.7] text-white/85">
      <SafetyBanner text={answer.safety_warning} />
      <FreshnessWarning text={answer.freshness_warning} />

      {answer.observed_facts.length > 0 && (
        <Section title="Observed facts">
          <ul className="list-disc space-y-2 pl-5 text-white/70 marker:text-white/25">
            {answer.observed_facts.map((f, i) => (
              <li key={i}>
                <Md text={f} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {answer.hypotheses.length > 0 && (
        <Section title="Ranked hypotheses">
          <ol className="space-y-4">
            {answer.hypotheses.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-semibold tabular text-white/60"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="text-white">
                    <Md text={h.cause} />
                  </div>
                  {h.supports && (
                    <div className="flex gap-2 text-[13.5px] text-emerald-200/90">
                      <span aria-hidden="true">✓</span>
                      <div className="min-w-0 flex-1">
                        <Md text={h.supports} />
                      </div>
                    </div>
                  )}
                  {h.conflicts && (
                    <div className="flex gap-2 text-[13.5px] text-[#ff9a9a]">
                      <span aria-hidden="true">✗</span>
                      <div className="min-w-0 flex-1">
                        <Md text={h.conflicts} />
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {answer.next_checks.length > 0 && (
        <Section title="Next checks">
          <ul className="list-disc space-y-2 pl-5 text-white/70 marker:text-white/25">
            {answer.next_checks.map((c, i) => (
              <li key={i}>
                <Md text={c} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {answer.visual && <AnswerVisual visual={answer.visual} machineKey={machineKey} />}

      {answer.citations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-5">
          {answer.citations.map((c, i) => (
            <CitationPill key={i} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// A hairline that runs to the end of the column gives each block a visible
// edge to scan against, which a bare bold label does not.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-3 flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/40">
        {title}
        <span aria-hidden="true" className="h-px flex-1 bg-white/[0.08]" />
      </h4>
      {children}
    </section>
  );
}

function Md({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;
}
