"use client";

import { useId, useState } from "react";
import type { LiveSample } from "./useLiveSeries";

const PALETTE = ["#ffffff", "#4ade80", "#67e8f9", "#fbbf24", "#c4b5fd", "#f472b6"];
const FAULT = "#ff5d5d";

/** Big premium multi-line trend board. One smooth glowing line per series on
 *  a shared scale, dashed setpoints where relevant, gradient mass under each
 *  line and a live legend with current values. Faulted series go red.
 *
 *  Overlapping series (running at ~the same value) are braided into a hybrid:
 *  the first draws solid, the rest overlay as dashes in their own colors, and
 *  no static head dots are drawn — lines end clean. Hovering anywhere shows a
 *  crosshair with beads plus a tooltip naming every series and its value at
 *  that moment. */
export function LiveTrendCard({
  title,
  unit,
  series,
  labels,
  sets,
  faultFlags,
  height = 260,
  zeroBased = false,
  decimals = 1,
}: {
  title: string;
  unit: string;
  series: LiveSample[];
  labels: string[];
  sets?: (number | undefined)[];
  faultFlags?: boolean[];
  height?: number;
  zeroBased?: boolean;
  decimals?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = height, PADL = 8, PADR = 10, PADT = 12, PADB = 8;
  const n = series.length;
  const count = labels.length;
  const allVals = series.flatMap((s) => s.vals.filter((x): x is number => x != null));
  const definedSets = (sets ?? []).filter((x): x is number => x != null);

  const currents = labels.map((_, k) => {
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const val = series[i].vals[k];
      if (val != null) return val;
    }
    return undefined;
  });

  if (n < 2 || allVals.length === 0) {
    return (
      <section aria-label={title} className="glass p-5 sm:p-6">
        <CardHeader title={title} />
        <div className="flex items-center justify-center gap-2.5 py-16 text-[13px] text-white/45" style={{ height }}>
          <span className="h-2 w-2 animate-pulse rounded-full bg-white/50" />
          Collecting live trend…
        </div>
      </section>
    );
  }

  const dMin = Math.min(...allVals, ...(definedSets.length ? definedSets : [Infinity]));
  const dMax = Math.max(...allVals, ...(definedSets.length ? definedSets : [-Infinity]));
  const lo = zeroBased ? 0 : Math.min(80, dMin - 6);
  const hi = zeroBased ? Math.max(10, dMax * 1.15 + 2) : Math.max(180, dMax + 6);
  const span = Math.max(hi - lo, 0.001);
  const X = (i: number) => PADL + (i / Math.max(n - 1, 1)) * (W - PADL - PADR);
  const Y = (v: number) => PADT + (1 - (v - lo) / span) * (H - PADT - PADB);

  const paths = Array.from({ length: count }, (_, k) => {
    const pts = series
      .map((s, i) => (s.vals[k] != null ? { x: X(i), y: Y(s.vals[k] as number) } : null))
      .filter((p): p is { x: number; y: number } => p != null);
    if (pts.length < 2) return null;
    const line = smooth(pts);
    const head = pts[pts.length - 1];
    return {
      line,
      area: `${line} L ${head.x.toFixed(1)} ${(H - PADB).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(H - PADB).toFixed(1)} Z`,
      head,
    };
  });

  const colorOf = (k: number) => (faultFlags?.[k] ? FAULT : PALETTE[k % PALETTE.length]);
  const range = `${dMin.toFixed(decimals)} – ${dMax.toFixed(decimals)}`;

  // Cluster series running at (nearly) the same value so they can share one
  // hybrid line + split head dot instead of hiding under each other.
  const groups = groupOverlaps(series, count, span);
  const firstOf = new Map<number, number>();
  groups.forEach((g) => {
    g.forEach((k) => {
      firstOf.set(k, g[0]);
    });
  });
  const isOverlay = (k: number) => (firstOf.get(k) ?? k) !== k;

  // Hover → nearest sample index, clamped as the buffer grows.
  const hi2 = hover != null ? Math.max(0, Math.min(n - 1, hover)) : null;
  const hoverPct = hi2 != null ? (X(hi2) / W) * 100 : 0;
  const indexFromClientX = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / Math.max(r.width, 1)) * W;
    return Math.max(0, Math.min(n - 1, Math.round(((x - PADL) / (W - PADL - PADR)) * (n - 1))));
  };

  return (
    <section aria-label={title} className="glass enter p-5 sm:p-6">
      <CardHeader title={title} />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {labels.map((l, k) => {
          const faulted = !!faultFlags?.[k];
          return (
            <span key={l} className="inline-flex items-baseline gap-1.5 text-[12.5px]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: colorOf(k),
                  boxShadow: faulted ? "0 0 8px rgba(255,93,93,0.8)" : undefined,
                }}
              />
              <span className="text-white/50">{l}</span>
              <span className={`font-semibold tabular ${faulted ? "text-[#ff8a8a]" : "text-white/90"}`}>
                {currents[k] != null ? currents[k]!.toFixed(decimals) : "—"}
              </span>
            </span>
          );
        })}
      </div>
      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair"
          role="img"
          aria-label={`${title}. Current range ${range} ${unit}. Hover to inspect values.`}
          onMouseMove={(e) => setHover(indexFromClientX(e.clientX, e.currentTarget))}
          onMouseLeave={() => setHover(null)}
          onTouchMove={(e) => {
            if (e.touches.length > 0) setHover(indexFromClientX(e.touches[0].clientX, e.currentTarget));
          }}
        >
          <defs>
            {labels.map((_, k) => (
              <linearGradient key={k} id={`${uid}-g${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorOf(k)} stopOpacity={isOverlay(k) ? 0 : 0.16} />
                <stop offset="100%" stopColor={colorOf(k)} stopOpacity="0" />
              </linearGradient>
            ))}
            <filter id={`${uid}-blur`} x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={PADL}
              x2={W - PADR}
              y1={PADT + (H - PADT - PADB) * f}
              y2={PADT + (H - PADT - PADB) * f}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
          ))}
          {definedSets.map((s, i) => (
            <line
              key={`set-${i}`}
              x1={PADL}
              x2={W - PADR}
              y1={Y(s)}
              y2={Y(s)}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1"
              strokeDasharray="5 4"
            />
          ))}
          {paths.map((p, k) =>
            p && !isOverlay(k) ? (
              <g key={k}>
                <path d={p.area} fill={`url(#${uid}-g${k})`} />
                <path
                  d={p.line}
                  fill="none"
                  stroke={colorOf(k)}
                  strokeWidth="5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity="0.28"
                  filter={`url(#${uid}-blur)`}
                />
                <path
                  d={p.line}
                  fill="none"
                  stroke={colorOf(k)}
                  strokeWidth={faultFlags?.[k] ? 2.6 : 1.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={faultFlags?.[k] ? 1 : 0.9}
                  style={faultFlags?.[k] ? { filter: "drop-shadow(0 0 7px rgba(255,93,93,0.65))" } : undefined}
                />
              </g>
            ) : null,
          )}
          {/* dashed hybrid overlays for series hiding under a sibling */}
          {paths.map((p, k) =>
            p && isOverlay(k) ? (
              <path
                key={`o${k}`}
                d={p.line}
                fill="none"
                stroke={colorOf(k)}
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="8 6"
                opacity="0.95"
              />
            ) : null,
          )}
          {/* no static head dots — lines end clean; beads appear on hover below */}
          {/* hover crosshair */}
          {hi2 != null && (
            <g aria-hidden="true">
              <line
                x1={X(hi2)}
                x2={X(hi2)}
                y1={PADT - 4}
                y2={H - PADB}
                stroke="rgba(255,255,255,0.30)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {paths.map((p, k) => {
                const val = series[hi2]?.vals[k];
                if (!p || val == null) return null;
                return (
                  <circle key={`c${k}`} cx={X(hi2)} cy={Y(val)} r="4" fill={colorOf(k)} />
                );
              })}
            </g>
          )}
        </svg>
        {/* hover tooltip — names every series and its value at that moment */}
        {hi2 != null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1 z-10 min-w-[148px] rounded-2xl border border-white/10 bg-black/70 px-3 py-2.5 shadow-2xl backdrop-blur-xl"
            style={{
              left: `${hoverPct}%`,
              transform: hoverPct > 62 ? "translate(calc(-100% - 12px), 0)" : "translate(12px, 0)",
            }}
          >
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40">
              {hi2 === n - 1 ? "now" : `${n - 1 - hi2}s ago`}
            </div>
            <ul className="space-y-1">
              {labels.map((l, k) => {
                const val = series[hi2]?.vals[k];
                if (val == null) return null;
                return (
                  <li key={l} className="flex items-baseline gap-2 text-[12px]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(k) }} />
                    <span className="text-white/55">{l}</span>
                    <span className="ml-auto pl-3 font-semibold tabular text-white">
                      {val.toFixed(decimals)}
                      <span className="ml-0.5 font-normal text-white/40">{unit}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** Union-find clustering: series whose values track each other within ~2% of
 *  the visible range belong to one overlap group. */
function groupOverlaps(series: LiveSample[], count: number, span: number): number[][] {
  const eps = Math.max(span * 0.02, 0.5);
  const par = Array.from({ length: count }, (_, i) => i);
  const find = (a: number): number => (par[a] === a ? a : (par[a] = find(par[a])));
  for (let a = 0; a < count; a += 1) {
    for (let b = a + 1; b < count; b += 1) {
      let common = 0;
      let maxD = 0;
      for (let i = 0; i < series.length; i += 1) {
        const x = series[i].vals[a];
        const y = series[i].vals[b];
        if (x != null && y != null) {
          common += 1;
          const d = Math.abs(x - y);
          if (d > maxD) maxD = d;
        }
      }
      if (common >= 2 && maxD < eps) par[find(a)] = find(b);
    }
  }
  const map = new Map<number, number[]>();
  for (let k = 0; k < count; k += 1) {
    const r = find(k);
    if (!map.has(r)) map.set(r, []);
    map.get(r)!.push(k);
  }
  return [...map.values()];
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-display text-[16px] font-semibold tracking-tight text-white">
        {title}
      </h3>
    </div>
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
