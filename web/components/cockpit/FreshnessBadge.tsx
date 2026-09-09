import type { Freshness } from "@/lib/api";

const STYLE: Record<Freshness, string> = {
  live: "bg-[#1d8127]/10 text-[#1d8127]",
  stale: "bg-[#b45309]/10 text-[#b45309]",
  disconnected: "bg-[#d70015]/[0.07] text-[#d70015]",
  bad_quality: "bg-[#b45309]/10 text-[#b45309]",
  unknown: "bg-black/[0.05] text-[#515154]",
};

export function FreshnessBadge({ freshness, age }: { freshness: Freshness; age: number | null }) {
  const label =
    freshness === "live" ? `Live${age != null ? ` · ${age.toFixed(1)}s ago` : ""}`
    : freshness === "stale" ? `Stale${age != null ? ` · ${age.toFixed(0)}s` : ""}`
    : freshness.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());
  const dot =
    freshness === "live" ? "bg-[#1d8127]"
    : freshness === "unknown" ? "bg-[#6e6e73]"
    : freshness === "stale" || freshness === "bad_quality" ? "bg-[#b45309]"
    : "bg-[#d70015]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${STYLE[freshness]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
