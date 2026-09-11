"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HEATERS, num, on } from "./meta";
import type { LiveSample } from "./useLiveSeries";

const SHORT = ["Front", "Rear", "V·1", "V·2"];
const TOL = 2;

/** Four live heater quadrants. Each zone gets its own window: current temp,
 *  setpoint, a live sparkline with tolerance band, deviation and output.
 *  The whole card links through to the heaters tab. */
export function TempQuadrants({
  machineKey,
  values,
  live,
}: {
  machineKey: string;
  values: Record<string, number>;
  live: LiveSample[];
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
          Heater zones
        </span>
        <Link
          href={`/machines/${machineKey}?tab=heaters`}
          className="group inline-flex items-center gap-1 text-[12px] font-medium text-white/50 transition-colors hover:text-white"
        >
          All zones
          <ArrowRight size={12} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 min-[1500px]:grid-cols-4">
        {HEATERS.map((h, k) => (
          <ZoneCard
            key={h.prefix}
            index={k}
            full={h.label}
            temp={num(values, `${h.prefix}_temp`)}
            set={num(values, `${h.prefix}_set`)}
            out={num(values, `${h.prefix}_output`)}
            intol={on(values, `${h.prefix}_tol`)}
            series={live.map((s) => s.vals[k])}
            href={`/machines/${machineKey}?tab=heaters`}
          />
        ))}
      </div>
    </div>
  );
}

function ZoneCard({
  index,
  full,
  temp,
  set,
  out,
  intol,
  series,
  href,
}: {
  index: number;
  full: string;
  temp: number | undefined;
  set: number | undefined;
  out: number | undefined;
  intol: boolean | undefined;
  series: (number | undefined)[];
  href: string;
}) {
  const bad = intol === false;
  const delta = temp != null && set != null ? temp - set : undefined;
  const outside = delta != null && Math.abs(delta) > TOL;

  return (
    <Link
      href={href}
      aria-label={`${full}: ${temp != null ? `${temp.toFixed(1)} degrees` : "unknown"}, setpoint ${set != null ? `${set.toFixed(1)} degrees` : "unknown"}`}
      className="glass-soft lift enter group relative block overflow-hidden p-4 sm:p-5"
      style={{
        animationDelay: `${index * 90}ms`,
        ...(bad
          ? {
              borderColor: "rgba(255,93,93,0.35)",
              boxShadow: "0 0 0 1px rgba(255,93,93,0.15), 0 18px 44px rgba(0,0,0,0.25)",
            }
          : undefined),
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            bad ? "bg-[#ff5d5d] fault-dot" : intol == null ? "bg-white/35" : "bg-emerald-300"
          }`}
        />
        <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/55">
          {SHORT[index] ?? full}
        </span>
        <span className="ml-auto font-mono text-[11px] tabular text-white/40">
          {set != null ? `set ${set.toFixed(1)}°` : "set —"}
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-display text-[34px] font-semibold leading-none tracking-tight tabular text-white">
          {temp != null ? temp.toFixed(1) : "—"}
        </span>
        <span className="text-[13px] text-white/40">°C</span>
        {bad && (
          <span className="ml-auto rounded-full border border-red-400/30 bg-red-400/15 px-2 py-0.5 text-[11px] font-bold tabular text-red-100">
            {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}°` : "FAULT"}
          </span>
        )}
      </div>

      <div className="mt-2">
        <ZoneSpark data={series} set={set} faulted={bad} label={full} />
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2.5 text-[12px]">
        <span className={`font-medium ${outside ? "text-[#ff8a8a]" : "text-white/50"}`}>
          {delta == null
            ? "No deviation data"
            : outside
              ? `${Math.abs(delta).toFixed(1)}° ${delta < 0 ? "below" : "above"} set`
              : `±${Math.abs(delta).toFixed(1)}° from set`}
        </span>
        <span className="font-mono tabular text-white/45">{out != null ? `out ${out.toFixed(0)}%` : "out —"}</span>
      </div>
    </Link>
  );
}

function ZoneSpark({ data, set, faulted, label }: { data: (number | undefined)[]; set: number | undefined; faulted: boolean; label: string }) {
  const W = 260, H = 64, PAD = 5;
  const pts = data
    .map((v, i) => (v != null ? { i, v } : null))
    .filter((p): p is { i: number; v: number } => p != null);

  if (pts.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center gap-2 text-[11.5px] text-white/35" aria-label={`${label} trend collecting`}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
        Collecting live trend…
      </div>
    );
  }

  const n = data.length;
  const vals = pts.map((p) => p.v);
  const dMin = Math.min(...vals), dMax = Math.max(...vals);
  // Same absolute scale in every quadrant so zones stay comparable, with a
  // little extra room under the minimum so a cold zone lifts off the floor
  // instead of reading as a flat line.
  const lo = set != null ? Math.min(set - 14, dMin - 8) : dMin - 8;
  const hi = set != null ? Math.max(set + 10, dMax + 4) : dMax + 8;
  const X = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - 2 * PAD);
  const Y = (v: number) => H - PAD - ((v - lo) / Math.max(hi - lo, 0.001)) * (H - 2 * PAD);

  const coords = pts.map((p) => ({ x: X(p.i), y: Y(p.v) }));
  const line = smooth(coords);
  const head = coords[coords.length - 1];
  const base = coords[0];
  const stroke = faulted ? "#ff5d5d" : "rgba(255,255,255,0.92)";
  const gid = `zg-${label.replace(/\W+/g, "")}`;
  const blurId = `zb-${label.replace(/\W+/g, "")}`;
  const area = `${line} L ${head.x.toFixed(1)} ${(H - PAD).toFixed(1)} L ${base.x.toFixed(1)} ${(H - PAD).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={faulted ? "#ff5d5d" : "#ffffff"} stopOpacity="0.38" />
          <stop offset="100%" stopColor={faulted ? "#ff5d5d" : "#ffffff"} stopOpacity="0.02" />
        </linearGradient>
        <filter id={blurId} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {set != null && (
        <>
          <rect
            x={PAD}
            y={Y(set + TOL)}
            width={W - 2 * PAD}
            height={Math.max(3, Y(set - TOL) - Y(set + TOL))}
            rx="3"
            fill="rgba(255,255,255,0.08)"
          />
          <line x1={PAD} x2={W - PAD} y1={Y(set)} y2={Y(set)} stroke="rgba(255,255,255,0.30)" strokeWidth="1" strokeDasharray="4 3" />
        </>
      )}
      <path d={area} fill={`url(#${gid})`} />
      {/* soft glow copy gives the line temperature mass even when it runs low */}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.35"
        filter={`url(#${blurId})`}
      />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={faulted ? 2.4 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={faulted ? { filter: "drop-shadow(0 0 6px rgba(255,93,93,0.6))" } : undefined}
      />
      {/* no static head bead — the live line itself carries the motion;
          hover beads live on the big trend charts */}
    </svg>
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
