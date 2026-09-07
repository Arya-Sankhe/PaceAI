import { AlertTriangle } from "lucide-react";

export function SafetyBanner({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex gap-2 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span><b>Stop — safety check:</b> {text}</span>
    </div>
  );
}
