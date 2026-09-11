"use client";

// ponytail: hand-rolled SVG — one file beats a chart library for lines + event ticks.
// Dark premium edition for the sage dashboard.
const COLORS = ["#ffffff", "#67e8f9", "#4ade80", "#fbbf24", "#c4b5fd", "#ff8a8a"];
const DASHES = ["", "7 4", "2 4", "10 4 2 4", "14 5", "4 3"];

export function MetricHistoryChart({
  points, keys, events,
}: {
  points: { t: string; values: Record<string, number | null> }[];
  keys: string[];
  events: { ts: string; event_type: string }[];
}) {
  const W = 800, H = 220, PAD = 32;
  const all = points.flatMap((p) => keys.map((k) => p.values[k]).filter((v): v is number => v != null));
  if (!points.length || !all.length) return <p className="py-8 text-center text-sm text-white/45">No data in range.</p>;
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const t0 = +new Date(points[0].t), t1 = +new Date(points[points.length - 1].t) || t0 + 1;
  const X = (t: string) => PAD + ((+new Date(t) - t0) / (t1 - t0)) * (W - 2 * PAD);
  const Y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const summary = `${keys.join(", ")} from ${new Date(points[0].t).toLocaleString()} to ${new Date(points[points.length - 1].t).toLocaleString()}, ranging ${min.toFixed(1)} to ${max.toFixed(1)}. ${events.length} events marked.`;

  return (
    <div className="glass p-4 sm:p-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Trend chart. ${summary}`}>
        <title>{summary}</title>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        ))}
        {keys.map((k, i) => (
          <polyline key={k} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray={DASHES[i % DASHES.length] || undefined} opacity="0.9"
            points={points.map((p) => {
              const v = p.values[k];
              return v == null ? "" : `${X(p.t).toFixed(1)},${Y(v).toFixed(1)}`;
            }).join(" ")} />
        ))}
        {events.map((e, i) => (
          <line key={i} x1={X(e.ts)} x2={X(e.ts)} y1={PAD - 8} y2={H - PAD}
            stroke="#ff5d5d" strokeDasharray="3 3" opacity="0.55" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-white/50">
        {keys.map((k, i) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="18" y2="3" stroke={COLORS[i % COLORS.length]} strokeWidth="2" strokeDasharray={DASHES[i % DASHES.length] || undefined} />
            </svg>
            {shortKey(k)}
          </span>
        ))}
        <span className="ml-auto tabular">{min.toFixed(1)} – {max.toFixed(1)}</span>
      </div>
    </div>
  );
}

function shortKey(k: string) {
  return k.replace("_temp", " °").replace("_", " ");
}
