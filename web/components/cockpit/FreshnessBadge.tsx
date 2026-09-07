import type { Freshness } from "@/lib/api";

const STYLE: Record<Freshness, string> = {
  live: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  stale: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  disconnected: "bg-red-500/15 text-red-300 border-red-500/40",
  bad_quality: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  unknown: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",
};

export function FreshnessBadge({ freshness, age }: { freshness: Freshness; age: number | null }) {
  const label =
    freshness === "live" ? `LIVE${age != null ? ` (${age.toFixed(1)}s)` : ""}`
    : freshness === "stale" ? `STALE${age != null ? ` (${age.toFixed(0)}s)` : ""}`
    : freshness.replace("_", " ").toUpperCase();
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${STYLE[freshness]}`}>
      {label}
    </span>
  );
}
