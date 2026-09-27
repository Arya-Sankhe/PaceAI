"use client";

import { useEffect, useState } from "react";
import { api, type ApiEvent, type Metric, type Signal, type Widget, type WidgetWindow } from "@/lib/api";
import { AXES, HEATERS, num } from "@/components/cockpit/meta";
import { evaluator } from "./expr";
import {
  Donut, Gauge, SERIES, STATUS, Sparkline, StatusIcon, TimeChart, fmt, niceDomain, toneFor, unitText,
  type Tone,
} from "./viz";

export interface Sample { t: number; values: Record<string, number | null>; }
export interface BoardData {
  machineKey: string;
  values: Record<string, number>;
  samples: Sample[];
  signals: Record<string, Signal>;
  events: ApiEvent[];
}

export const LIVE_MS = 5 * 60_000;
const WINDOW_MS: Record<Exclude<WidgetWindow, "live">, number> = {
  "1h": 3_600_000, "8h": 28_800_000, "24h": 86_400_000, "7d": 604_800_000,
};

// Trend widgets on the same window share one request, refreshed each minute.
const historyCache = new Map<string, { at: number; p: Promise<Sample[]> }>();
function fetchHistory(machineKey: string, window: Exclude<WidgetWindow, "live">) {
  const id = `${machineKey}:${window}`;
  const hit = historyCache.get(id);
  if (hit && Date.now() - hit.at < 55_000) return hit.p;
  const until = new Date();
  const since = new Date(until.getTime() - WINDOW_MS[window]);
  const p = api.history(machineKey, since.toISOString(), until.toISOString())
    .then((h) => h.points.map((q) => ({ t: Date.parse(q.t), values: q.values })))
    .catch((e) => {
      historyCache.delete(id);
      throw e;
    });
  historyCache.set(id, { at: Date.now(), p });
  return p;
}

function useHistory(machineKey: string, window: WidgetWindow | undefined) {
  const [data, setData] = useState<{ window: string; samples: Sample[] } | null>(null);
  useEffect(() => {
    if (!window || window === "live") return;
    let alive = true;
    const load = () => fetchHistory(machineKey, window).then((s) => alive && setData({ window, samples: s })).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [machineKey, window]);
  return data && data.window === window ? data.samples : null;
}

const read = (m: Metric, values: Record<string, number | null>) => evaluator(m)(values);
const seriesOf = (m: Metric, samples: Sample[]) => {
  const ev = evaluator(m);
  const out: { t: number; v: number }[] = [];
  for (const s of samples) {
    const v = ev(s.values);
    if (v != null) out.push({ t: s.t, v });
  }
  return out;
};
const unitOf = (m: Metric, signals: Record<string, Signal>) => m.unit ?? (m.key ? signals[m.key]?.unit : "") ?? "";

function targetOf(w: Widget, values: Record<string, number>) {
  if (!w.target) return undefined;
  return w.target.key ? num(values, w.target.key) : w.target.value;
}

// ---------------------------------------------------------------------------

export function WidgetBody({ widget, data, width, height }: {
  widget: Widget; data: BoardData; width: number; height: number;
}) {
  if (width < 10 || height < 10) return null;
  switch (widget.type) {
    case "stat": return <StatBody w={widget} data={data} width={width} height={height} />;
    case "gauge": return <GaugeBody w={widget} data={data} width={width} height={height} />;
    case "line": return <LineBody w={widget} data={data} width={width} height={height} />;
    case "bars": return <BarsBody w={widget} data={data} height={height} />;
    case "split": return <SplitBody w={widget} data={data} width={width} height={height} />;
    case "status": return <StatusBody w={widget} data={data} width={width} />;
    case "table": return <TableBody w={widget} data={data} width={width} />;
    case "heaters": return <HeatersBody values={data.values} width={width} height={height} />;
    case "drives": return <DrivesBody values={data.values} width={width} />;
    case "events": return <EventsBody events={data.events} />;
  }
}

function StatBody({ w, data, width, height }: { w: Widget; data: BoardData; width: number; height: number }) {
  const metrics = w.metrics ?? [];
  const n = metrics.length;
  const cols = Math.max(1, Math.min(n, Math.floor(width / 150) || 1));
  const rows = Math.ceil(n / cols);
  const GAP = 10;
  const tileW = (width - GAP * (cols - 1)) / cols;
  const tileH = (height - GAP * (rows - 1)) / rows;
  const target = targetOf(w, data.values);
  const since = Date.now() - LIVE_MS;

  return (
    <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: GAP }}>
      {metrics.map((m, i) => {
        const unit = unitOf(m, data.signals);
        const v = read(m, data.values);
        const text = fmt(v, unit);
        const pts = seriesOf(m, data.samples).filter((p) => p.t >= since);
        const spark = tileH >= 104 ? Math.min(64, tileH - 86) : 0;
        const size = Math.max(20, Math.min(tileH * 0.36, (tileW - 24) / Math.max(3, text.length * 0.6 + (unitText(unit) ? 1.2 : 0)), 64));
        const tone = i === 0 ? toneFor(v, target, w.band) : "neutral";
        const first = pts[0]?.v;
        const delta = v != null && first != null && pts.length > 3 ? v - first : undefined;
        return (
          <div key={i} className={`flex min-w-0 flex-col justify-between ${n > 1 ? "rounded-2xl bg-white/[0.04] px-3.5 py-3" : ""}`}>
            <div className="flex items-center gap-2">
              {n > 1 && <span className="truncate text-[12px] font-medium text-white/55">{m.label}</span>}
              {delta != null && Math.abs(delta) > 1e-9 && tileH >= 80 && (
                <span className="ml-auto shrink-0 text-[11.5px] tabular text-white/45" title="Change over the last five minutes">
                  {delta > 0 ? "↑" : "↓"} {fmt(Math.abs(delta), unit)}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5 leading-none">
              <span className="font-display font-semibold tabular tracking-tight text-white" style={{ fontSize: size }}>{text}</span>
              {unitText(unit) && <span className="font-medium text-white/45" style={{ fontSize: Math.max(12, size * 0.38) }}>{unitText(unit)}</span>}
            </div>
            {target != null && i === 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-[12px] text-white/60">
                <StatusIcon tone={tone} />
                <span className="tabular">
                  Target {fmt(target, unit)}{v != null ? ` · ${v - target >= 0 ? "+" : "−"}${fmt(Math.abs(v - target), unit)}` : ""}
                </span>
              </div>
            )}
            {spark > 0 && <Sparkline pts={pts} color={SERIES[i % SERIES.length]} width={Math.max(20, tileW - (n > 1 ? 28 : 0))} height={spark} />}
          </div>
        );
      })}
    </div>
  );
}

function GaugeBody({ w, data, width, height }: { w: Widget; data: BoardData; width: number; height: number }) {
  const m = w.metrics![0];
  const unit = unitOf(m, data.signals);
  const v = read(m, data.values);
  const target = targetOf(w, data.values);
  const range = m.key ? data.signals[m.key]?.range : undefined;
  const lo = w.min ?? range?.[0] ?? (unit === "%" ? 0 : 0);
  const hi = w.max ?? range?.[1] ?? (unit === "%" ? 100 : niceDomain(0, Math.max(v ?? 1, target ?? 0) * 1.3).hi);
  const tone = toneFor(v, target, w.band);
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <Gauge value={v} min={lo} max={hi} target={target} unit={unit} tone={tone} width={width} height={height - (target != null ? 22 : 0)} />
      {target != null && (
        <div className="flex items-center gap-1.5 text-[12px] text-white/60">
          <StatusIcon tone={tone} />
          <span className="tabular">Target {fmt(target, unit)}</span>
        </div>
      )}
    </div>
  );
}

function LineBody({ w, data, width, height }: { w: Widget; data: BoardData; width: number; height: number }) {
  const window = w.window ?? "live";
  const history = useHistory(data.machineKey, window);
  const metrics = w.metrics ?? [];
  const now = Date.now();
  const live = window === "live";
  const samples = live ? data.samples : history;
  const domain: [number, number] = live
    ? [now - LIVE_MS, now]
    : [now - WINDOW_MS[window as Exclude<WidgetWindow, "live">], now];
  const series = metrics.map((m, i) => ({
    label: m.label, unit: unitOf(m, data.signals), color: SERIES[i % SERIES.length],
    pts: samples ? seriesOf(m, samples) : [],
  }));
  const target = targetOf(w, data.values);
  const legendH = 24;

  if (!samples) {
    return <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-white/45"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/50" />Loading {window}…</div>;
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[24px] items-center gap-x-4 overflow-hidden" style={{ minHeight: legendH }}>
        {series.map((s) => (
          <span key={s.label} className="inline-flex shrink-0 items-center gap-1.5 text-[12px]">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-white/55">{s.label}</span>
            <span className="font-semibold tabular text-white/90">{fmt(read(metrics[series.indexOf(s)], data.values), s.unit)}</span>
          </span>
        ))}
        {target != null && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-white/55">
            <svg width="14" height="4" aria-hidden="true"><line x1="0" y1="2" x2="14" y2="2" stroke="#fff" strokeOpacity="0.6" strokeDasharray="3 2" /></svg>
            Target <span className="font-semibold tabular text-white/90">{fmt(target, series[0]?.unit)}</span>
          </span>
        )}
      </div>
      <TimeChart
        series={series}
        width={width}
        height={Math.max(40, height - legendH - 6)}
        domain={domain}
        live={live}
        targets={target != null && series[0] ? [{ value: target, unit: series[0].unit, band: w.band }] : []}
        events={live ? [] : data.events.map((e) => Date.parse(e.ts))}
      />
    </div>
  );
}

function BarsBody({ w, data, height }: { w: Widget; data: BoardData; height: number }) {
  const metrics = w.metrics ?? [];
  const rows = metrics.map((m) => ({ m, unit: unitOf(m, data.signals), v: read(m, data.values) }));
  const top = Math.max(0, ...rows.map((r) => r.v ?? 0));
  const max = w.max ?? (top > 0 ? niceDomain(0, top, 4).hi : 1);
  const min = w.min ?? 0;
  const rowH = Math.max(26, Math.min(44, (height - 4) / Math.max(1, rows.length)));
  return (
    <ul className="h-full overflow-y-auto pr-1" role="list">
      {rows.map(({ m, unit, v }) => {
        const f = v == null ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
        return (
          <li key={m.label} className="grid grid-cols-[minmax(72px,34%)_1fr_auto] items-center gap-3" style={{ height: rowH }}>
            <span className="truncate text-[12.5px] text-white/60" title={m.label}>{m.label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full" style={{ width: `${f * 100}%`, background: SERIES[0], transition: "width 600ms var(--ease-out)" }} />
            </div>
            <span className="min-w-[56px] text-right text-[12.5px] font-semibold tabular text-white/90">
              {fmt(v, unit)}<span className="ml-0.5 font-normal text-white/40">{unitText(unit)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SplitBody({ w, data, width, height }: { w: Widget; data: BoardData; width: number; height: number }) {
  const metrics = w.metrics ?? [];
  const parts = metrics.map((m, i) => ({ label: m.label, unit: unitOf(m, data.signals), v: read(m, data.values) ?? 0, color: SERIES[i % SERIES.length] }));
  const total = parts.reduce((a, p) => a + Math.max(0, p.v), 0);
  const side = width > height * 1.35;
  const size = Math.max(60, Math.min(side ? height : height - 22 * parts.length - 12, side ? width * 0.48 : width) - 4);
  const unit = parts[0]?.unit ?? "";
  return (
    <div className={`flex h-full items-center justify-center gap-5 ${side ? "flex-row" : "flex-col"}`}>
      <Donut
        parts={parts}
        size={size}
        center={
          <>
            <span className="font-display font-semibold tabular text-white" style={{ fontSize: Math.max(14, size * 0.17) }}>{fmt(total, unit)}</span>
            <span className="text-[11px] text-white/45">total{unitText(unit) ? ` ${unitText(unit)}` : ""}</span>
          </>
        }
      />
      <ul className="min-w-0 space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="truncate text-white/60">{p.label}</span>
            <span className="ml-auto pl-3 font-semibold tabular text-white/90">{total > 0 ? `${((100 * Math.max(0, p.v)) / total).toFixed(1)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FAULTY = /error|fault|alarm|bypass|estop|emergency/i;
// Signals that should be on in normal running: off is the thing to notice.
const EXPECTED = /tol|sync|homed|powered|running|ready|producing/i;
const TOLERANCE = /tol/i;

function StatusBody({ w, data, width }: { w: Widget; data: BoardData; width: number }) {
  const metrics = w.metrics ?? [];
  const cols = Math.max(1, Math.min(metrics.length, Math.floor(width / 170) || 1));
  return (
    <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {metrics.map((m) => {
        const v = read(m, data.values);
        const id = m.key ?? m.label;
        const on = v != null && v !== 0;
        let tone: Tone = on ? "good" : "neutral";
        let word = on ? "On" : "Off";
        if (FAULTY.test(id)) [tone, word] = on ? ["critical", "Active"] : ["good", "Clear"];
        else if (TOLERANCE.test(id)) [tone, word] = on ? ["good", "In tol"] : ["critical", "Out of tol"];
        else if (EXPECTED.test(id)) [tone, word] = on ? ["good", "Yes"] : ["warn", "No"];
        if (v == null) [tone, word] = ["neutral", "No data"];
        return (
          <li
            key={m.label}
            className="flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5"
            style={{
              borderColor: tone === "neutral" ? "rgba(255,255,255,0.08)" : `${STATUS[tone]}33`,
              background: tone === "neutral" ? "rgba(255,255,255,0.03)" : `${STATUS[tone]}12`,
            }}
          >
            <StatusIcon tone={tone} size={14} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/75" title={m.label}>{m.label}</span>
            <span className="shrink-0 text-[12px] font-semibold text-white/90">{word}</span>
          </li>
        );
      })}
    </ul>
  );
}

function TableBody({ w, data, width }: { w: Widget; data: BoardData; width: number }) {
  const since = Date.now() - LIVE_MS;
  const wide = width > 440;
  const rows = (w.metrics ?? []).map((m) => {
    const unit = unitOf(m, data.signals);
    const pts = seriesOf(m, data.samples).filter((p) => p.t >= since);
    const vs = pts.map((p) => p.v);
    return {
      m, unit, pts, now: read(m, data.values),
      lo: vs.length ? Math.min(...vs) : undefined,
      hi: vs.length ? Math.max(...vs) : undefined,
      avg: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : undefined,
    };
  });
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">
            <th className="pb-2 font-semibold">Signal</th>
            <th className="pb-2 text-right font-semibold">Now</th>
            {wide && <th className="pb-2 text-right font-semibold">Min</th>}
            {wide && <th className="pb-2 text-right font-semibold">Max</th>}
            <th className="pb-2 text-right font-semibold">Avg 5m</th>
            {width > 560 && <th className="pb-2 pl-4 font-semibold">Trend</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((r) => (
            <tr key={r.m.label}>
              <td className="max-w-0 truncate py-2 pr-3 text-white/70" title={r.m.label}>{r.m.label}</td>
              <td className="py-2 text-right font-semibold tabular text-white">{fmt(r.now, r.unit)} <span className="font-normal text-white/40">{unitText(r.unit)}</span></td>
              {wide && <td className="py-2 pl-3 text-right tabular text-white/60">{fmt(r.lo, r.unit)}</td>}
              {wide && <td className="py-2 pl-3 text-right tabular text-white/60">{fmt(r.hi, r.unit)}</td>}
              <td className="py-2 pl-3 text-right tabular text-white/60">{fmt(r.avg, r.unit)}</td>
              {width > 560 && <td className="py-2 pl-4"><Sparkline pts={r.pts} width={96} height={20} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeatersBody({ values, width, height }: { values: Record<string, number>; width: number; height: number }) {
  const cols = width > 760 ? 4 : width > 360 ? 2 : 1;
  const big = height / Math.ceil(4 / cols) > 150;
  return (
    <div className="grid h-full gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {HEATERS.map((h) => {
        const t = num(values, `${h.prefix}_temp`);
        const set = num(values, `${h.prefix}_set`);
        const out = num(values, `${h.prefix}_output`);
        const tol = num(values, `${h.prefix}_tol`);
        const on = num(values, `${h.prefix}_heater_on`);
        const tone: Tone = tol == null ? "neutral" : tol ? "good" : "critical";
        return (
          <div key={h.prefix} className="flex min-w-0 flex-col justify-between rounded-2xl bg-white/[0.04] px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span className="truncate text-[12.5px] font-medium text-white/60">{h.label}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-[11.5px] text-white/70">
                <StatusIcon tone={tone} />
                {tol == null ? "—" : tol ? "In tol" : "Out of tol"}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`font-display font-semibold tabular tracking-tight text-white ${big ? "text-[34px]" : "text-[26px]"}`}>{fmt(t, "°C")}</span>
              <span className="text-[13px] text-white/45">°C</span>
              <span className="ml-auto text-[12px] tabular text-white/50">set {fmt(set)}</span>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-white/45">
                <span>Output{on === 0 ? " · heater off" : ""}</span>
                <span className="tabular">{fmt(out)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, out ?? 0))}%`, background: SERIES[0], transition: "width 600ms var(--ease-out)" }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DrivesBody({ values, width }: { values: Record<string, number>; width: number }) {
  const wide = width > 460;
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">
            <th className="pb-2 font-semibold">Drive</th>
            <th className="pb-2 text-right font-semibold">Speed</th>
            <th className="pb-2 text-right font-semibold">Current</th>
            {wide && <th className="pb-2 text-right font-semibold">Temp</th>}
            <th className="pb-2 pl-3 text-right font-semibold">State</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {AXES.map((a) => {
            const err = num(values, `${a.prefix}_error_active`);
            const id = num(values, `${a.prefix}_error_id`);
            const tone: Tone = err == null ? "neutral" : err ? "critical" : "good";
            return (
              <tr key={a.prefix}>
                <td className="py-2 pr-2 text-white/75">{a.label}</td>
                <td className="py-2 text-right tabular text-white">{fmt(num(values, `${a.prefix}_rpm`))} <span className="text-white/40">rpm</span></td>
                <td className="py-2 pl-2 text-right tabular text-white">{fmt(num(values, `${a.prefix}_current`))} <span className="text-white/40">A</span></td>
                {wide && <td className="py-2 pl-2 text-right tabular text-white">{fmt(num(values, `${a.prefix}_temp`))} <span className="text-white/40">°C</span></td>}
                <td className="py-2 pl-3">
                  <span className="flex items-center justify-end gap-1.5 text-white/80">
                    <StatusIcon tone={tone} />
                    {err == null ? "—" : err ? `Fault${id ? ` ${id}` : ""}` : "OK"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EventsBody({ events }: { events: ApiEvent[] }) {
  if (!events.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[12.5px] text-white/50">
        <StatusIcon tone="good" size={16} />
        No events. The line has been quiet.
      </div>
    );
  }
  return (
    <ul className="h-full space-y-1.5 overflow-y-auto pr-1">
      {events.slice(0, 30).map((e) => {
        const tone: Tone = e.severity === "error" ? "critical" : e.severity === "warn" ? "warn" : "neutral";
        return (
          <li key={e.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2 text-[12.5px]">
            <StatusIcon tone={tone} size={13} />
            <span className="truncate font-medium text-white/85">{e.event_type}{e.data?.component ? ` · ${String(e.data.component)}` : ""}</span>
            <span className="ml-auto shrink-0 tabular text-white/45">{new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </li>
        );
      })}
    </ul>
  );
}
