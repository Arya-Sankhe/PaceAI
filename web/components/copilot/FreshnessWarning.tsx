import { ClockAlert } from "lucide-react";

export function FreshnessWarning({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-200">
      <ClockAlert size={16} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
