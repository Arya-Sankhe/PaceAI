import { ClockAlert } from "lucide-react";

export function FreshnessWarning({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex gap-2.5 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3.5 text-[13px] leading-snug text-amber-100">
      <ClockAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
