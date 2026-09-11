import { AlertTriangle } from "lucide-react";

export function SafetyBanner({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex gap-2.5 rounded-2xl border border-red-400/25 bg-red-400/10 p-3.5 text-[13px] leading-snug text-red-100">
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[#ff8a8a]" />
      <span><b>Stop — safety check:</b> {text}</span>
    </div>
  );
}
