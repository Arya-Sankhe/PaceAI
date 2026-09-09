import { ClockAlert } from "lucide-react";

export function FreshnessWarning({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex gap-2.5 rounded-2xl bg-[#b45309]/[0.08] p-3.5 text-[13px] leading-snug text-[#8a4108]">
      <ClockAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
