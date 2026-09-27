"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Gauge, OctagonAlert, PieChart, ShieldCheck } from "lucide-react";
import { AXES, HEATERS, num, on } from "./meta";

const GOOD = "#6ee7b7";
const WARN = "#fbbf24";
const BAD = "#ff6b6b";

function CardHead({ icon: Icon, title, href, aside }: { icon: typeof Gauge; title: string; href: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-white/55">
      <Icon size={14} aria-hidden="true" />
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em]">{title}</span>
      <span className="ml-auto flex items-center gap-2">
        {aside}
        <Link href={href} aria-label={`Open ${title.toLowerCase()} details`} className="text-white/30 transition-colors hover:text-white">
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </span>
    </div>
  );
}

/* ── speed: actual vs set, on a 0…max arc ─────────────────────────────── */

export function SpeedCard({ values, href }: { values: Record<string, number>; href: string }) {
  const actual = num(values, "actual_speed");
  const set = num(values, "set_speed");
  const max = Math.max(num(values, "max_speed") ?? 0, set ?? 0, actual ?? 0, 1);
  const running = on(values, "running");
  const ratio = actual != null && set ? actual / set : undefined;
  const delta = actual != null && set != null ? actual - set : undefined;
  const stopped = running === false || (actual != null && actual < 0.5);
  const tone = stopped ? "rgba(255,255,255,0.55)" : ratio == null ? "#fff" : ratio >= 0.95 ? GOOD : ratio >= 0.8 ? WARN : BAD;

  // semicircle 180° → 0°, left to right
  const W = 220, H = 124, R = 92, CX = W / 2, CY = 108, SW = 12;
  const pt = (f: number, r = R) => {
    const a = Math.PI * (1 - Math.min(1, Math.max(0, f)));
    return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
  };
  const arc = (f: number) => {
    const e = pt(f);
    return `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };
  const fa = actual != null ? actual / max : 0;
  const fs = set != null ? set / max : undefined;

  return (
    <section aria-label="Machine speed" className="glass enter enter-2 flex flex-col p-4 sm:p-5">
      <CardHead
        icon={Gauge}
        title="Speed"
        href={href}
        aside={
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal" style={{ color: tone, background: "rgba(255,255,255,0.07)" }}>
            {stopped ? "Stopped" : ratio != null ? `${Math.round(ratio * 100)}% of set` : "—"}
          </span>
        }
      />
      <div className="relative mx-auto mt-2 w-full max-w-[260px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
          aria-label={`Actual ${actual != null ? Math.round(actual) : "unknown"} packs per minute, set ${set != null ? Math.round(set) : "unknown"}, maximum ${Math.round(max)}`}>
          <path d={arc(1)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={SW} strokeLinecap="round" />
          {fa > 0.002 && <path d={arc(fa)} fill="none" stroke={tone} strokeWidth={SW} strokeLinecap="round" style={{ transition: "d 600ms ease" }} />}
          {fs != null && (() => {
            const a = pt(fs, R - SW / 2 - 4), b = pt(fs, R + SW / 2 + 4), l = pt(fs, R + SW / 2 + 13);
            return (
              <g>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                <text x={l.x} y={l.y} fontSize="9.5" fontWeight="600" fill="rgba(255,255,255,0.7)" textAnchor="middle" dominantBaseline="middle">SET</text>
              </g>
            );
          })()}
          <text x={CX - R} y={CY + 13} fontSize="9.5" fill="rgba(255,255,255,0.4)" textAnchor="middle">0</text>
          <text x={CX + R} y={CY + 13} fontSize="9.5" fill="rgba(255,255,255,0.4)" textAnchor="middle">{Math.round(max)}</text>
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
          <div className="font-display text-[34px] font-semibold leading-none tracking-tight tabular text-white">
            {actual != null ? Math.round(actual) : "—"}
          </div>
          <div className="mt-1 text-[11.5px] text-white/50">ppm actual</div>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-3 border-t border-white/10 pt-3 text-center">
        <Stat label="Set" value={set != null ? `${Math.round(set)}` : "—"} />
        <Stat label="Actual" value={actual != null ? `${Math.round(actual)}` : "—"} />
        <Stat label="Gap" value={delta != null ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(Math.round(delta))}` : "—"} tone={stopped ? undefined : tone} />
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular text-white" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  );
}

/* ── OEE: ring for the headline, meters for A × P × Q ─────────────────── */

export function OeeCard({ values, href }: { values: Record<string, number>; href: string }) {
  const oee = num(values, "oee");
  const parts = [
    { key: "availability", label: "Availability" },
    { key: "performance", label: "Performance" },
    { key: "quality", label: "Quality" },
  ].map((p) => ({ ...p, v: num(values, p.key) }));
  const tone = oee == null ? "#fff" : oee >= 85 ? GOOD : oee >= 60 ? WARN : BAD;
  const R = 44, C = 2 * Math.PI * R, f = Math.min(1, Math.max(0, (oee ?? 0) / 100));

  return (
    <section aria-label="OEE this shift" className="glass enter enter-3 flex flex-col p-4 sm:p-5">
      <CardHead icon={PieChart} title="OEE" href={href} aside={<span className="text-[11px] normal-case tracking-normal text-white/40">this shift</span>} />
      <div className="mt-3 flex flex-1 items-center gap-5">
        <div className="relative h-[116px] w-[116px] shrink-0">
          <svg viewBox="0 0 116 116" className="h-full w-full -rotate-90" role="img" aria-label={`OEE ${oee != null ? oee.toFixed(1) : "unknown"} percent`}>
            <circle cx="58" cy="58" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
            {f > 0 && (
              <circle cx="58" cy="58" r={R} fill="none" stroke={tone} strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${C * f} ${C}`} style={{ transition: "stroke-dasharray 600ms ease" }} />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-[26px] font-semibold leading-none tabular text-white">
              {oee != null ? Math.round(oee) : "—"}<span className="text-[14px] text-white/50">%</span>
            </span>
            <span className="mt-1 text-[10.5px] text-white/45">OEE</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2.5">
          {parts.map((p) => (
            <li key={p.key}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-white/60">{p.label}</span>
                <span className="font-semibold tabular text-white">{p.v != null ? `${p.v.toFixed(1)}%` : "—"}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white/85" style={{ width: `${Math.min(100, Math.max(0, p.v ?? 0))}%`, transition: "width 600ms ease" }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 border-t border-white/10 pt-3 text-[11.5px] text-white/45">
        Availability × performance × quality, as computed by the HMI.
      </p>
    </section>
  );
}

/* ── machine health: is it running, and is anything wrong ─────────────── */

type Issue = { title: string; detail: string; severity: "critical" | "warn" };

export function machineIssues(values: Record<string, number>, info: Record<string, string>): Issue[] {
  const out: Issue[] = [];
  if (on(values, "estop")) out.push({ title: "Emergency stop pressed", detail: "Release and reset on the HMI", severity: "critical" });
  for (const a of AXES) {
    if (on(values, `${a.prefix}_error_active`)) {
      const id = num(values, `${a.prefix}_error_id`);
      const text = info[`${a.prefix}_error_text`];
      out.push({ title: `${a.label} drive fault`, detail: text || (id ? `Error ${Math.round(id)}` : "Error active"), severity: "critical" });
    }
  }
  const drivesFaulted = out.some((i) => i.title.endsWith("drive fault"));
  if (on(values, "fault_active") && !drivesFaulted) out.push({ title: "Machine fault active", detail: "Check the HMI alarm list", severity: "critical" });
  const alarms = num(values, "alarm_count") ?? 0;
  if (on(values, "alarm_active") || alarms > 0) {
    out.push({ title: alarms > 1 ? `${Math.round(alarms)} alarms active` : "Alarm active", detail: "See the HMI alarm list for the text", severity: "warn" });
  }
  for (const h of HEATERS) {
    if (on(values, `${h.prefix}_tol`) === false) out.push({ title: `${h.label} out of tolerance`, detail: "Heater zone outside its HMI band", severity: "warn" });
  }
  return out;
}

export function machineState(values: Record<string, number>, issues: Issue[]) {
  if (on(values, "estop")) return { label: "Emergency stop", tone: BAD };
  if (issues.some((i) => i.severity === "critical")) return { label: "Faulted", tone: BAD };
  const running = on(values, "running");
  if (running && on(values, "producing") !== false) return { label: "Running", tone: GOOD };
  if (running) return { label: "Running · not producing", tone: WARN };
  if (on(values, "ready_to_start")) return { label: "Stopped · ready to start", tone: "rgba(255,255,255,0.75)" };
  if (running === false) return { label: "Stopped", tone: "rgba(255,255,255,0.75)" };
  return { label: "Unknown", tone: "rgba(255,255,255,0.5)" };
}

export function HealthCard({ values, info, href, connected }: { values: Record<string, number>; info: Record<string, string>; href: string; connected: boolean }) {
  const issues = connected ? machineIssues(values, info) : [];
  const state = connected ? machineState(values, issues) : { label: "No telemetry", tone: "rgba(255,255,255,0.5)" };
  const critical = issues.some((i) => i.severity === "critical");
  const checks = [
    { label: "Emergency stop", ok: !on(values, "estop"), okText: "Clear", badText: "Pressed" },
    { label: "Faults", ok: !issues.some((i) => i.severity === "critical"), okText: "None", badText: "Active" },
    { label: "Alarms", ok: !on(values, "alarm_active") && !(num(values, "alarm_count") ?? 0), okText: "None", badText: "Active" },
  ];

  return (
    <section
      aria-label="Machine status"
      className="glass enter enter-4 flex flex-col p-4 sm:p-5"
      style={issues.length ? { borderColor: critical ? "rgba(255,93,93,0.35)" : "rgba(251,191,36,0.3)" } : undefined}
    >
      <CardHead icon={ShieldCheck} title="Status" href={href} />
      <div className="mt-3 flex items-center gap-2.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.tone === GOOD ? "live-dot" : critical ? "fault-dot" : ""}`} style={{ background: state.tone }} />
        <span className="font-display text-[22px] font-semibold leading-tight tracking-tight text-white">{state.label}</span>
      </div>
      <div className="mt-1 text-[12.5px]" style={{ color: !connected ? "rgba(255,255,255,0.5)" : issues.length ? (critical ? "#ff9b9b" : WARN) : GOOD }}>
        {!connected ? "Can’t read the machine right now" : issues.length ? `${issues.length} active issue${issues.length > 1 ? "s" : ""}` : "No alarms or faults"}
      </div>

      {issues.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {issues.slice(0, 3).map((i) => (
            <li key={i.title} className="flex items-start gap-2 rounded-xl bg-white/[0.05] px-2.5 py-2">
              {i.severity === "critical"
                ? <OctagonAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: BAD }} />
                : <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: WARN }} />}
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium text-white">{i.title}</span>
                <span className="block truncate text-[11.5px] text-white/50">{i.detail}</span>
              </span>
            </li>
          ))}
          {issues.length > 3 && <li className="px-1 text-[11.5px] text-white/45">+{issues.length - 3} more</li>}
        </ul>
      ) : (
        <ul className="mt-auto space-y-1.5 border-t border-white/10 pt-3">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-[12.5px]">
              {c.ok
                ? <CheckCircle2 size={13} aria-hidden="true" style={{ color: GOOD }} />
                : <OctagonAlert size={13} aria-hidden="true" style={{ color: BAD }} />}
              <span className="text-white/60">{c.label}</span>
              <span className="ml-auto font-semibold text-white">{connected ? (c.ok ? c.okText : c.badText) : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
