import { AlertTriangle } from "lucide-react";

export function SafetyBanner({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex gap-2.5 rounded-2xl bg-[#d70015]/[0.06] p-3.5 text-[13px] leading-snug text-[#a30011]">
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span><b>Stop — safety check:</b> {text}</span>
    </div>
  );
}
