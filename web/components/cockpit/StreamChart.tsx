"use client";

import type { LiveSample } from "./useLiveSeries";

const LINE = ["#1d1d1f", "#0071e3", "#1d8127", "#b45309"];
const FAULT = "#d70015";

// Live stream: the last N telemetry ticks as smooth area/line series.
// Series are distinguished by color AND position; the legend below the chart
// names each series with its current value. Setpoint band marks the target.
export function StreamChart({
  series,
  labels,
  sets,
  faultIndex,
}: {
  series: LiveSample[];
  labels: string[];
  sets: (number | undefined)[];
  faultIndex: number | null;
}) {
  const W = 640, H = 200, PAD = 8;
  const n = series.length;
  const temps = series.flatMap((s) => s.vals.filter((x): x is number => x != null));
  if (n < 2 || temps.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-[13px] text-[#6e6e73]">
        Warming up the live stream…
      </div>
    );
  }

  const definedSets = sets.filter((x): x is number => x != null);
  const dMin = Math.min(...temps, ...(definedSets.length ? [Math.min(...definedSets)] : [Infinity]));
  const dMax = Math.max(...temps, ...(definedSets.length ? [Math.max(...definedSets)] : [-Infinity]));
  const lo = Math.min(80, dMin - 6);
  const hi = Math.max(180, dMax + 6);
  const X = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - 2 * PAD);
  const Y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);

  const bandLo = definedSets.length ? Y(Math.max(...definedSets) + 2) : null;
  const bandHi = definedSets.length ? Y(Math.min(...definedSets) - 2) : null;

  const count = labels.length;
  const paths = Array.from({ length: count }, (_, k) => {
    const pts = series
      .map((s, i) => (s.vals[k] != null ? ({ x: X(i), y: Y(s.vals[k] as number) }) : null))
      .filter((p): p is { x: number; y: number } => p != null);
    if (pts.length < 2) return null;
    return { line: smooth(pts), area: `${smooth(pts)} L ${pts[pts.length - 1].x} ${H - PAD} L ${pts[0].x} ${H - PAD} Z`, head: pts[pts.length - 1] };
  });

  const currents = labels.map((_, k) => {
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const val = series[i].vals[k];
      if (val != null) return val;
    }
    return undefined;
  });

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Live heater temperatures. ${labels.map((l, k) => `${l} ${currents[k] != null ? `${currents[k]!.toFixed(1)} degrees` : "unknown"}`).join(", ")}.`}>
        {[0.33, 0.66].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
        ))}
        {bandLo != null && bandHi != null && (
          <rect x={PAD} y={bandLo} width={W - 2 * PAD} height={bandHi - bandLo} fill="rgba(0,0,0,0.045)" rx="4" />
        )}
        {faultIndex != null && paths[faultIndex]?.area && (
          <path d={paths[faultIndex]!.area} fill={`${FAULT}14`} />
        )}
        {paths.map((p, k) =>
          p ? (
            <path key={k} d={p.line} fill="none"
              stroke={k === faultIndex ? FAULT : LINE[k % LINE.length]}
              strokeWidth={k === faultIndex ? 2.4 : 1.8} strokeLinejoin="round" strokeLinecap="round" />
          ) : null,
        )}
        {faultIndex != null && paths[faultIndex]?.head && (
          <circle cx={paths[faultIndex]!.head.x} cy={paths[faultIndex]!.head.y} r="4" fill={FAULT} className="stream-pulse" />
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-5 gap-y-1.5">
        {labels.map((l, k) => (
          <span key={l} className="inline-flex items-baseline gap-1.5 text-[12.5px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: k === faultIndex ? FAULT : LINE[k % LINE.length] }} />
            <span className="text-[#6e6e73]">{l}</span>
            <span className="font-medium tabular text-[#1d1d1f]">
              {currents[k] != null ? `${currents[k]!.toFixed(1)}°` : "—"}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

// Catmull-Rom → cubic bezier for a calm, non-jagged live line.
function smooth(pts: { x: number; y: number }[]): string {
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
