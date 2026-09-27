"use client";

// Dashboard marks. Everything draws in real pixels from a measured box, so a
// resized card re-lays its chart instead of stretching it. Series hues follow
// a fixed, CVD-validated order on the dark glass surface; status colours are
// reserved for good/warning/critical and always ship with an icon + word.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, CircleSlash, OctagonAlert } from "lucide-react";

export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
export const STATUS = { good: "#4ade80", warn: "#fbbf24", critical: "#ff6b6b" } as const;
export type Tone = keyof typeof STATUS | "neutral";

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((s) => (s.w === Math.round(width) && s.h === Math.round(height) ? s : { w: Math.round(width), h: Math.round(height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

// ---------- number formatting -------------------------------------------------

export function fmt(v: number | undefined, unit = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "s") return duration(v);
  const a = Math.abs(v);
  if (unit === "bags" || unit === "counts" || a >= 1000) return Math.round(v).toLocaleString();
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(a >= 100 ? 1 : a >= 10 ? 1 : 2);
}

export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

/** Units that read after the number, not "°C°C" in the title. */
export const unitText = (u?: string) => (!u || u === "s" || u === "counts" ? "" : u);

function niceStep(span: number, count: number) {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

export function niceDomain(lo: number, hi: number, count = 4) {
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.05 || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, count);
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = a; t <= b + step / 2; t += step) ticks.push(+t.toFixed(10));
  return { lo: a, hi: b, ticks };
}

// ---------- status ------------------------------------------------------------

export function StatusIcon({ tone, size = 12 }: { tone: Tone; size?: number }) {
  const Icon = tone === "good" ? Check : tone === "warn" ? AlertTriangle : tone === "critical" ? OctagonAlert : CircleSlash;
  return <Icon size={size} aria-hidden="true" style={{ color: tone === "neutral" ? "rgba(255,255,255,0.4)" : STATUS[tone] }} />;
}

/** In band -> good, within twice the band -> warn, else critical. */
export function toneFor(v: number | undefined, target: number | undefined, band: number | undefined): Tone {
  if (v == null || target == null) return "neutral";
  const b = band ?? Math.max(Math.abs(target) * 0.02, 1);
  const d = Math.abs(v - target);
  return d <= b ? "good" : d <= 2 * b ? "warn" : "critical";
}

// ---------- sparkline ---------------------------------------------------------

export function Sparkline({ pts, color = SERIES[0], width, height }: {
  pts: { t: number; v: number }[]; color?: string; width: number; height: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (pts.length < 2 || width < 20 || height < 8) return <div style={{ height }} />;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  const floor = Math.max(Math.abs((lo + hi) / 2) * 0.04, 1e-6);
  if (hi - lo < floor) {
    const mid = (lo + hi) / 2;
    lo = mid - floor / 2;
    hi = mid + floor / 2;
  }
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const X = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (width - 4) + 2;
  const Y = (v: number) => 2 + (1 - (v - lo) / (hi - lo)) * (height - 4);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${X(last.t).toFixed(1)} ${height}L${X(t0).toFixed(1)} ${height}Z`} fill={`url(#${uid}s)`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(last.t)} cy={Y(last.v)} r="2.5" fill={color} />
    </svg>
  );
}

// ---------- time chart --------------------------------------------------------

export interface TimeSeries { label: string; unit: string; color: string; pts: { t: number; v: number }[]; }

const TIME_STEPS = [1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400].map((s) => s * 1000);

function timeTicks(t0: number, t1: number, count: number) {
  const step = TIME_STEPS.find((s) => (t1 - t0) / s <= count) ?? 86_400_000;
  const off = new Date().getTimezoneOffset() * 60_000;
  const out: number[] = [];
  for (let t = Math.ceil((t0 - off) / step) * step + off; t <= t1; t += step) out.push(t);
  return { ticks: out, step };
}

function timeLabel(t: number, step: number, span: number) {
  const d = new Date(t);
  if (span > 2 * 86_400_000) return d.toLocaleDateString([], { weekday: "short", day: "numeric" });
  if (step < 60_000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function nearest(pts: { t: number }[], t: number) {
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t < t) lo = mid; else hi = mid;
  }
  return Math.abs(pts[lo].t - t) <= Math.abs(pts[hi].t - t) ? lo : hi;
}

/** One chart, one y-axis per unit: mixed units stack as panels on a shared time axis. */
export function TimeChart({ series, width, height, domain, targets = [], events = [], live }: {
  series: TimeSeries[];
  width: number;
  height: number;
  domain: [number, number];
  targets?: { value: number; unit: string; band?: number }[];
  events?: number[];
  live?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hoverT, setHoverT] = useState<number | null>(null);
  const withData = series.filter((s) => s.pts.length > 0);
  if (!withData.length || width < 40 || height < 40) {
    return (
      <div className="flex items-center justify-center gap-2 text-[12.5px] text-white/45" style={{ width, height }}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/50" />
        {live ? "Collecting live samples…" : "No data in this window yet"}
      </div>
    );
  }

  const units = [...new Set(series.map((s) => s.unit))];
  const AXIS_H = 18, PANEL_GAP = 12, PADR = 6;
  const panelH = (height - AXIS_H - PANEL_GAP * (units.length - 1)) / units.length;
  const [t0, t1] = domain;

  const panels = units.map((unit, p) => {
    const members = series.filter((s) => s.unit === unit);
    const tg = targets.filter((t) => t.unit === unit);
    const vals = members.flatMap((s) => s.pts.filter((q) => q.t >= t0).map((q) => q.v));
    const extra = tg.flatMap((t) => [t.value - (t.band ?? 0), t.value + (t.band ?? 0)]);
    const all = [...vals, ...extra];
    const d = niceDomain(all.length ? Math.min(...all) : 0, all.length ? Math.max(...all) : 1, panelH > 140 ? 4 : panelH > 80 ? 3 : 2);
    const top = p * (panelH + PANEL_GAP);
    return { unit, members, tg, d, top };
  });
  const gutter = Math.max(28, ...panels.flatMap((p) => p.d.ticks.map((t) => fmt(t).length * 6.4 + 10)));
  const plotW = Math.max(10, width - gutter - PADR);
  const X = (t: number) => gutter + ((t - t0) / Math.max(1, t1 - t0)) * plotW;
  const Yof = (p: (typeof panels)[number]) => (v: number) => p.top + 4 + (1 - (v - p.d.lo) / (p.d.hi - p.d.lo || 1)) * (panelH - 8);
  const tt = timeTicks(t0, t1, Math.max(2, Math.floor(plotW / 90)));

  // Break the line where samples are missing instead of drawing across the gap.
  const pathOf = (pts: { t: number; v: number }[], Y: (v: number) => number) => {
    // Seeded history (minutes apart) flows into live ticks (a second apart), so
    // a gap only counts when it dwarfs the spacing on both sides of it.
    const vis = pts.filter((q) => q.t >= t0 - (t1 - t0) * 0.02);
    if (!vis.length) return "";
    const dt = (i: number) => (i > 0 && i < vis.length ? vis[i].t - vis[i - 1].t : 0);
    const broken = (i: number) => dt(i) > Math.max(5_000, 4 * Math.max(dt(i - 1), dt(i + 1)));
    return vis.map((q, i) => `${i && !broken(i) ? "L" : "M"}${X(q.t).toFixed(1)} ${Y(q.v).toFixed(1)}`).join("");
  };

  const hover = hoverT == null ? null : Math.max(t0, Math.min(t1, hoverT));
  const hoverRows = hover == null ? [] : series.map((s) => {
    if (!s.pts.length) return null;
    const q = s.pts[nearest(s.pts, hover)];
    return Math.abs(q.t - hover) < (t1 - t0) * 0.05 ? { s, q } : null;
  });
  const snapT = hoverRows.find(Boolean)?.q.t ?? hover;
  const hx = snapT != null ? X(snapT) : 0;

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        className="block cursor-crosshair touch-pan-y"
        role="img"
        aria-label={series.map((s) => `${s.label}: ${fmt(s.pts[s.pts.length - 1]?.v, s.unit)} ${unitText(s.unit)}`).join(". ")}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHoverT(t0 + ((e.clientX - r.left - gutter) / plotW) * (t1 - t0));
        }}
        onPointerLeave={() => setHoverT(null)}
      >
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${uid}a${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
          <clipPath id={`${uid}c`}>
            <rect x={gutter} y={0} width={plotW + PADR} height={height} />
          </clipPath>
        </defs>

        {panels.map((p) => {
          const Y = Yof(p);
          return (
            <g key={p.unit}>
              {p.d.ticks.map((t) => (
                <g key={t}>
                  <line x1={gutter} x2={width - PADR} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.07)" />
                  <text x={gutter - 8} y={Y(t)} dy="0.32em" textAnchor="end" className="tabular" fontSize="10.5" fill="rgba(255,255,255,0.42)">
                    {fmt(t)}
                  </text>
                </g>
              ))}
              {unitText(p.unit) && (
                <text x={width - PADR} y={p.top + 10} textAnchor="end" fontSize="10.5" fontWeight="600" fill="rgba(255,255,255,0.45)">{unitText(p.unit)}</text>
              )}
              <g clipPath={`url(#${uid}c)`}>
                {p.tg.map((t, i) => (
                  <g key={i}>
                    {t.band ? (
                      <rect x={gutter} width={plotW} y={Y(t.value + t.band)} height={Math.max(0, Y(t.value - t.band) - Y(t.value + t.band))} fill="rgba(74,222,128,0.07)" />
                    ) : null}
                    <line x1={gutter} x2={width - PADR} y1={Y(t.value)} y2={Y(t.value)} stroke="rgba(255,255,255,0.5)" strokeDasharray="5 4" />
                  </g>
                ))}
                {p.members.map((s) => {
                  const i = series.indexOf(s);
                  const d = pathOf(s.pts, Y);
                  if (!d) return null;
                  const last = s.pts[s.pts.length - 1];
                  const first = s.pts.find((q) => q.t >= t0) ?? s.pts[0];
                  return (
                    <g key={i}>
                      {p.members.length === 1 && !d.slice(1).includes("M") && (
                        <path d={`${d}L${X(last.t).toFixed(1)} ${p.top + panelH}L${X(first.t).toFixed(1)} ${p.top + panelH}Z`} fill={`url(#${uid}a${i})`} />
                      )}
                      <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                      {live && (
                        <circle cx={X(last.t)} cy={Y(last.v)} r="3.5" fill={s.color} stroke="rgba(20,26,32,0.9)" strokeWidth="2" />
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          );
        })}

        {events.filter((t) => t >= t0 && t <= t1).map((t, i) => (
          <line key={i} x1={X(t)} x2={X(t)} y1={0} y2={height - AXIS_H} stroke={STATUS.critical} strokeDasharray="3 3" opacity="0.7" />
        ))}

        {tt.ticks.map((t) => (
          <text key={t} x={X(t)} y={height - 4} textAnchor="middle" fontSize="10.5" className="tabular" fill="rgba(255,255,255,0.42)">
            {timeLabel(t, tt.step, t1 - t0)}
          </text>
        ))}

        {snapT != null && (
          <g aria-hidden="true">
            <line x1={hx} x2={hx} y1={0} y2={height - AXIS_H} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
            {hoverRows.map((r) => {
              if (!r) return null;
              const p = panels.find((pp) => pp.unit === r.s.unit)!;
              return <circle key={r.s.label} cx={X(r.q.t)} cy={Yof(p)(r.q.v)} r="4" fill={r.s.color} stroke="rgba(20,26,32,0.9)" strokeWidth="2" />;
            })}
          </g>
        )}
      </svg>

      {snapT != null && hoverRows.some(Boolean) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 z-10 min-w-[150px] rounded-xl border border-white/10 bg-[#0c1117]/85 px-3 py-2 shadow-2xl backdrop-blur-xl"
          style={{ left: hx, transform: hx > width * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
        >
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/45">
            {new Date(snapT).toLocaleString([], t1 - t0 > 86_400_000 ? { weekday: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <ul className="space-y-0.5">
            {hoverRows.map((r) =>
              r ? (
                <li key={r.s.label} className="flex items-center gap-2 text-[12px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.s.color }} />
                  <span className="truncate text-white/60">{r.s.label}</span>
                  <span className="ml-auto pl-3 font-semibold tabular text-white">
                    {fmt(r.q.v, r.s.unit)}
                    <span className="ml-0.5 font-normal text-white/45">{unitText(r.s.unit)}</span>
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- gauge -------------------------------------------------------------

export function Gauge({ value, min, max, target, unit, tone, width, height }: {
  value: number | undefined; min: number; max: number; target?: number; unit: string;
  tone: Tone; width: number; height: number;
}) {
  const SWEEP = 240;
  // The arc's ends sit at cy + r/2; their labels need ~22px under that.
  const r = Math.max(10, Math.min(width / 2 - 16, (height - 36) / 1.5));
  const cx = width / 2, cy = r + 10;
  const frac = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
  const at = (f: number, rr = r) => {
    const a = ((-SWEEP / 2 + f * SWEEP - 90) * Math.PI) / 180;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };
  const arc = (f0: number, f1: number) => {
    const [x0, y0] = at(f0), [x1, y1] = at(f1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${(f1 - f0) * SWEEP > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const stroke = Math.max(6, r * 0.13);
  const color = tone === "neutral" ? SERIES[0] : STATUS[tone];
  const f = value == null ? 0 : frac(value);
  const [lx, ly] = at(0, r), [rx, ry] = at(1, r);
  return (
    <svg width={width} height={height} role="img" aria-label={`${fmt(value, unit)} ${unitText(unit)} on a scale of ${fmt(min)} to ${fmt(max)}`} className="block">
      <path d={arc(0, 1)} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} strokeLinecap="round" />
      {value != null && f > 0.002 && (
        <path d={arc(0, f)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" style={{ transition: "d 600ms var(--ease-out)" }} />
      )}
      {target != null && (() => {
        const [x0, y0] = at(frac(target), r - stroke);
        const [x1, y1] = at(frac(target), r + stroke);
        return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#fff" strokeWidth="2" strokeLinecap="round" />;
      })()}
      <text x={cx} y={cy + r * 0.08} textAnchor="middle" className="font-display tabular" fontSize={Math.max(16, r * 0.42)} fontWeight="600" fill="#fff">
        {fmt(value, unit)}
      </text>
      {unitText(unit) && (
        <text x={cx} y={cy + r * 0.08 + Math.max(13, r * 0.22)} textAnchor="middle" fontSize={Math.max(11, r * 0.15)} fill="rgba(255,255,255,0.5)">
          {unitText(unit)}
        </text>
      )}
      <text x={lx} y={ly + 16} textAnchor="middle" fontSize="10.5" className="tabular" fill="rgba(255,255,255,0.42)">{fmt(min)}</text>
      <text x={rx} y={ry + 16} textAnchor="middle" fontSize="10.5" className="tabular" fill="rgba(255,255,255,0.42)">{fmt(max)}</text>
    </svg>
  );
}

// ---------- donut -------------------------------------------------------------

export function Donut({ parts, size, center }: {
  parts: { label: string; v: number; color: string }[]; size: number; center?: ReactNode;
}) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.v), 0);
  const r = size / 2 - 4;
  const stroke = Math.max(8, size * 0.13);
  const C = 2 * Math.PI * (r - stroke / 2);
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r - stroke / 2} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        {total > 0 && parts.map((p) => {
          const len = (Math.max(0, p.v) / total) * C;
          const gap = parts.filter((q) => q.v > 0).length > 1 ? Math.min(3, len / 2) : 0;
          const el = (
            <circle key={p.label} cx={size / 2} cy={size / 2} r={r - stroke / 2} fill="none" stroke={p.color} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-acc} style={{ transition: "stroke-dasharray 600ms var(--ease-out), stroke-dashoffset 600ms var(--ease-out)" }} />
          );
          acc += len;
          return el;
        })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}
