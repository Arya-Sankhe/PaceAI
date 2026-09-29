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
  const verdict = answer.verdict?.trim();
  return (
    <div className="font-answer space-y-7 text-[17px] leading-[1.65] text-white/85">
      <SafetyBanner text={answer.safety_warning} />
      <FreshnessWarning text={answer.freshness_warning} />

      {verdict && (
        <div className="text-[19px] leading-[1.6] text-white [&_p]:m-0 [&_strong]:font-semibold [&_strong]:text-white">
          <Md text={verdict} />
        </div>
      )}

      {answer.next_checks.length > 0 && (
        <Section title="Steps to fix it">
          <ol className="list-decimal space-y-2.5 pl-6 text-white/80 marker:font-semibold marker:text-white/40">
            {answer.next_checks.map((c, i) => (
              <li key={i} className="pl-1">
                <Md text={c} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {answer.hypotheses.length > 0 && (
        <Section title="How we narrowed it down">
          <ol className="space-y-5">
            {answer.hypotheses.map((h, i) => (
              <li key={i} className="flex gap-3.5">
                <span
                  aria-hidden="true"
                  className="mt-[3px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-semibold tabular text-white/60"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="font-medium text-white">
                    <Md text={h.cause} />
                  </div>
                  {h.supports && (
                    <div className="flex gap-2 text-[15px] text-emerald-200/90">
                      <span aria-hidden="true">✓</span>
                      <div className="min-w-0 flex-1">
                        <Md text={h.supports} />
                      </div>
                    </div>
                  )}
                  {h.conflicts && !/^none\.?$/i.test(h.conflicts.trim()) && (
                    <div className="flex gap-2 text-[15px] text-[#ff9a9a]">
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

      {answer.observed_facts.length > 0 && (
        <details className="group">
          <summary className="font-ui flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/40 transition-colors hover:text-white/70 [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="text-[11px] transition-transform group-open:rotate-90">
              ▶
            </span>
            What the machine shows
          </summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] text-white/65 marker:text-white/25">
            {answer.observed_facts.map((f, i) => (
              <li key={i}>
                <Md text={f} />
              </li>
            ))}
          </ul>
        </details>
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
      <h4 className="font-ui mb-3 flex items-center gap-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/40">
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
