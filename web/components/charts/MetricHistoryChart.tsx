"use client";

// ponytail: hand-rolled SVG — one file beats a chart library for lines + event ticks.
const COLORS = ["#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#a78bfa", "#facc15"];

export function MetricHistoryChart({
  points, keys, events,
}: {
  points: { t: string; values: Record<string, number | null> }[];
  keys: string[];
  events: { ts: string; event_type: string }[];
}) {
  const W = 800, H = 220, PAD = 32;
  const all = points.flatMap((p) => keys.map((k) => p.values[k]).filter((v): v is number => v != null));
  if (!points.length || !all.length) return <p className="text-sm text-zinc-500">No data in range.</p>;
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const t0 = +new Date(points[0].t), t1 = +new Date(points[points.length - 1].t) || t0 + 1;
  const X = (t: string) => PAD + ((+new Date(t) - t0) / (t1 - t0)) * (W - 2 * PAD);
  const Y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-zinc-800 bg-zinc-900">
      {keys.map((k, i) => (
        <polyline key={k} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="1.5"
          points={points.map((p) => {
            const v = p.values[k];
            return v == null ? "" : `${X(p.t).toFixed(1)},${Y(v).toFixed(1)}`;
          }).join(" ")} />
      ))}
      {events.map((e, i) => (
        <line key={i} x1={X(e.ts)} x2={X(e.ts)} y1={PAD - 8} y2={H - PAD}
          stroke="#f87171" strokeDasharray="3 3" opacity="0.7" />
      ))}
      <text x={PAD} y={14} fill="#71717a" fontSize="10">
        {keys.join(" · ")} (red ticks = events) · {min.toFixed(1)}–{max.toFixed(1)}
      </text>
    </svg>
  );
}
