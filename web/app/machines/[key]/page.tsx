"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Flame,
  Package,
  Settings2,
  Sparkles,
} from "lucide-react";
import { AXES, HEATERS, num, on } from "@/components/cockpit/meta";
import { HeaterZoneCard } from "@/components/cockpit/HeaterZoneCard";
import { ServoAxisCard } from "@/components/cockpit/ServoAxisCard";
import { TempQuadrants } from "@/components/cockpit/TempQuadrants";
import { LiveTrendCard } from "@/components/cockpit/LiveTrendCard";
import { MachineInfoCard, MachineStatusCard } from "@/components/cockpit/MachinePanels";
import { OeePanel } from "@/components/cockpit/OeePanel";
import { HistoryView } from "@/components/cockpit/HistoryView";
import { AssistantPanel } from "@/components/copilot/AssistantPanel";
import { useLiveSeries } from "@/components/cockpit/useLiveSeries";
import { VIEWS, type ViewId } from "@/components/layout/AppSidebar";
import { useMachineLatest } from "@/hooks/useMachineLatest";
import { demoMode } from "@/lib/api";

const VALID: ViewId[] = ["overview", "heaters", "drives", "production", "system", "history", "assistant"];

export default function CockpitPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-white/50">Loading…</p>}>
      <CockpitInner />
    </Suspense>
  );
}

function CockpitInner() {
  const { key } = useParams<{ key: string }>();
  const search = useSearchParams();
  const raw = search.get("tab") as ViewId | null;
  const tab: ViewId = raw && VALID.includes(raw) ? raw : "overview";
  const { state } = useMachineLatest(key);
  const v = state?.values ?? {};
  const info = state?.info ?? {};
  const titles = state?.titles ?? {};

  const heaterTol = HEATERS.map((h) => on(v, `${h.prefix}_tol`));
  const heaterIssues = HEATERS.filter((h) => on(v, `${h.prefix}_tol`) === false).map((h) => {
    const temp = num(v, `${h.prefix}_temp`);
    const set = num(v, `${h.prefix}_set`);
    const delta = temp != null && set != null ? temp - set : undefined;
    return {
      label: h.label,
      detail: delta == null ? "Out of tolerance" : `${Math.abs(delta).toFixed(1)}° ${delta < 0 ? "below" : "above"} setpoint`,
    };
  });
  const driveFaults = AXES.filter((a) => {
    const err = num(v, `${a.prefix}_error_id`) ?? 0;
    return err !== 0 && on(v, `${a.prefix}_error_active`) === true;
  }).map((a) => ({ label: `${a.prefix.toUpperCase()} · ${a.label}`, detail: `Error ${Math.round(num(v, `${a.prefix}_error_id`) ?? 0)}` }));
  const faultCode = num(v, "fault_code");
  const attention = heaterIssues.length + driveFaults.length + (faultCode ? 1 : 0);
  const hasAttention = attention > 0 || state?.collector_connected === false;

  const inTol = HEATERS.filter((h) => on(v, `${h.prefix}_tol`)).length;
  const healthy = AXES.filter((a) => {
    const err = num(v, `${a.prefix}_error_id`) ?? 0;
    return !(err !== 0 && on(v, `${a.prefix}_error_active`) === true);
  }).length;
  const prod = num(v, "prod_remaining");
  const good = num(v, "count_good");
  const bad = num(v, "count_bad");
  const scrap = good != null && bad != null && good + bad > 0 ? (100 * bad) / (good + bad) : null;

  const tempSnapshot = useMemo(
    () => HEATERS.map((h) => num(v, `${h.prefix}_temp`)),
    // Rebuilt whenever a new snapshot arrives (state identity changes per tick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );
  const parsed = state?.source_ts ? Date.parse(state.source_ts) : NaN;
  const live = useLiveSeries(key, Number.isFinite(parsed) ? parsed : null, tempSnapshot);
  // Rolling buffer of drive speeds for the servo trend widget.
  const driveSnapshot = useMemo(
    () => AXES.map((a) => num(v, `${a.prefix}_rpm`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );
  const driveLive = useLiveSeries(`${key}:drives`, Number.isFinite(parsed) ? parsed : null, driveSnapshot);
  const driveFaultFlags = AXES.map((a) => {
    const err = num(v, `${a.prefix}_error_id`) ?? 0;
    return err !== 0 && on(v, `${a.prefix}_error_active`) === true;
  });

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 px-1 pb-16 pt-4 sm:pt-8">
      {/* mobile section nav — the sidebar covers this on desktop */}
      <nav className="enter flex gap-1.5 overflow-x-auto pb-1 lg:hidden" aria-label="Machine sections">
          {VIEWS.map((view) => (
            <Link
              key={view.id}
              href={`/machines/${key}?tab=${view.id}`}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold backdrop-blur transition-all ${
                tab === view.id
                  ? "border-white bg-white text-black shadow-lg"
                  : "border-white/10 bg-black/20 text-white/65 hover:text-white"
              }`}
            >
              {view.label}
            </Link>
          ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-4">
          {/* problem box — its own glass window, only when something is wrong */}
          {hasAttention ? (
            <section
              aria-label="Needs attention"
              className="glass enter enter-1 p-2"
              style={{
                borderColor: "rgba(255,93,93,0.30)",
                boxShadow: "0 0 0 1px rgba(255,93,93,0.12), 0 18px 44px rgba(0,0,0,0.22)",
              }}
            >
              <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
                <span className="h-2 w-2 rounded-full bg-[#ff5d5d] fault-dot" />
                <span className="text-[13.5px] font-semibold text-white">Needs attention</span>
                <span className="ml-auto text-[12px] tabular text-white/45">{attention} open</span>
              </div>
              <ul className="space-y-0.5">
                {heaterIssues.slice(0, 2).map((i) => (
                  <IssueCheck key={i.label} title={i.label} detail={i.detail} href={`/machines/${key}?tab=heaters`} tone="bad" />
                ))}
                {driveFaults.slice(0, 1).map((i) => (
                  <IssueCheck key={i.label} title={i.label} detail={i.detail} href={`/machines/${key}?tab=drives`} tone="bad" />
                ))}
                {faultCode ? (
                  <IssueCheck
                    title={`Fault ${Math.round(faultCode)}`}
                    detail="See production for context"
                    href={`/machines/${key}?tab=production`}
                    tone="bad"
                  />
                ) : null}
                {state?.collector_connected === false && (
                  <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13.5px]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ff5d5d]/15 text-[#ff8a8a]">
                      <AlertTriangle size={14} />
                    </span>
                    <span>
                      <span className="block font-medium text-white">Telemetry unavailable</span>
                      <span className="block text-[12.5px] text-white/50">Showing last known values.</span>
                    </span>
                  </li>
                )}
              </ul>
            </section>
          ) : (
            <div
              className="glass enter enter-1 flex items-center gap-2.5 px-5 py-3.5"
              style={{ borderColor: "rgba(52,211,153,0.25)" }}
            >
              <CheckCircle2 size={16} aria-hidden="true" className="shrink-0 text-emerald-300" />
              <span className="text-[13.5px] font-semibold text-white">Running normally</span>
              <span className="ml-auto text-[12.5px] tabular text-white/45">
                {inTol}/4 zones · {healthy}/6 axes
              </span>
            </div>
          )}

          {/* live heater zones — four quadrants replace the old combined chart */}
          <TempQuadrants machineKey={key} values={v} live={live} />

          {/* KPI frosted trio — wafer model pricing grid */}
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              index={3}
              href={`/machines/${key}?tab=heaters`}
              icon={Flame}
              title="Heaters"
              big={`${inTol}/4`}
              sub="zones in tolerance"
              visual={
                <span className="flex gap-1.5" aria-hidden="true">
                  {heaterTol.map((t, i) => (
                    <span
                      key={i}
                      className="h-1.5 flex-1 rounded-full"
                      style={{ background: t === false ? "#ff5d5d" : t === true ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)" }}
                    />
                  ))}
                </span>
              }
            />
            <KpiCard
              index={4}
              href={`/machines/${key}?tab=drives`}
              icon={Settings2}
              title="Drives"
              big={`${healthy}/6`}
              sub="axes healthy"
              visual={
                <span className="flex gap-1.5" aria-hidden="true">
                  {AXES.map((a, i) => {
                    const err = num(v, `${a.prefix}_error_id`) ?? 0;
                    const badAxis = err !== 0 && on(v, `${a.prefix}_error_active`) === true;
                    return (
                      <span
                        key={i}
                        className="h-2 w-2 rounded-full"
                        style={{ background: badAxis ? "#ff5d5d" : "rgba(255,255,255,0.8)" }}
                      />
                    );
                  })}
                </span>
              }
            />
            <KpiCard
              index={5}
              href={`/machines/${key}?tab=production`}
              icon={Package}
              title="Output"
              big={prod != null ? compact(prod) : "—"}
              sub={scrap != null ? `${scrap.toFixed(1)}% scrap · bags left` : "bags left"}
              visual={
                <span className="flex items-center gap-2 text-[11.5px] text-white/50" aria-hidden="true">
                  <Activity size={13} />
                  {faultCode ? <span className="font-semibold text-[#ff8a8a]">Fault {Math.round(faultCode)}</span> : <span>Running nominal</span>}
                </span>
              }
            />
          </div>

          {/* explore — minimal rows */}
          <section aria-label="Explore" className="glass enter enter-6 divide-y divide-white/[0.07] !rounded-[20px] p-1.5">
            <ExploreRow
              href={`/machines/${key}?tab=heaters`}
              icon={Flame}
              title="Heaters"
              summary={`${inTol} of 4 in tolerance`}
            />
            <ExploreRow
              href={`/machines/${key}?tab=drives`}
              icon={Settings2}
              title="Drives"
              summary={`${healthy} of 6 healthy`}
            />
            <ExploreRow
              href={`/machines/${key}?tab=production`}
              icon={Package}
              title="Production"
              summary={prod == null ? "—" : `${Math.round(prod).toLocaleString()} bags left`}
            />
            <ExploreRow
              href={`/machines/${key}?tab=assistant`}
              icon={Sparkles}
              title="Assistant"
              summary={faultCode ? `Ask about fault ${Math.round(faultCode)}` : "Ask about this machine"}
              ai
            />
          </section>

          <p className="px-1 text-center text-[12px] text-white/40">
            {demoMode ? "Demo data · simulated snapshot every second." : "Live controller telemetry."}
            {info.date_time ? ` · PLC ${info.date_time}` : ""}
          </p>
        </div>
      )}

      {tab === "heaters" && (
        <div className="enter space-y-4">
          <SectionIntro title="Heaters" sub="Setpoint, output and tolerance per zone." />
          <MasterHeater values={v} />
          <div className="grid gap-3.5 sm:grid-cols-2 min-[1500px]:grid-cols-4">
            {HEATERS.map((h) => <HeaterZoneCard key={h.prefix} prefix={h.prefix} label={h.label} values={v} />)}
          </div>
          <LiveTrendCard
            title="Temperature trend"
            unit="°C"
            series={live}
            labels={["Front", "Rear", "V·1", "V·2"]}
            sets={HEATERS.map((h) => num(v, `${h.prefix}_set`))}
            faultFlags={HEATERS.map((h) => on(v, `${h.prefix}_tol`) === false)}
            height={280}
          />
        </div>
      )}

      {tab === "drives" && (
        <div className="enter space-y-4">
          <SectionIntro title="Servo drives" sub="Speed, load and health per axis." />
          <div className="grid gap-3.5 sm:grid-cols-2 min-[1500px]:grid-cols-3">
            {AXES.map((a) => (
              <ServoAxisCard key={a.prefix} prefix={a.prefix} label={a.label} hasPos={a.hasPos}
                values={v} errorText={info[`${a.prefix}_error_text`]} />
            ))}
          </div>
          <LiveTrendCard
            title="Axis speed trend"
            unit="rpm"
            series={driveLive}
            labels={AXES.map((a) => a.prefix.toUpperCase())}
            faultFlags={driveFaultFlags}
            height={240}
            zeroBased
          />
        </div>
      )}

      {tab === "production" && (
        <div className="enter space-y-4">
          <SectionIntro title="Production" sub="Output, scrap and shift time." />
          <OeePanel values={v} titles={titles} />
        </div>
      )}

      {tab === "system" && (
        <div className="enter space-y-4">
          <SectionIntro title="System" sub="Identity and live controller signals." />
          <MachineInfoCard values={v} info={info} />
          <MachineStatusCard values={v} />
        </div>
      )}

      {tab === "history" && (
        <div className="enter space-y-4">
          <SectionIntro title="History" sub="Trends and events over time." />
          <HistoryView machineKey={key} />
        </div>
      )}

      {tab === "assistant" && <AssistantPanel machineKey={key} />}
    </div>
  );
}

function compact(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function IssueCheck({ title, detail, href, tone }: { title: string; detail: string; href: string; tone: "bad" | "ok" }) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
            tone === "bad"
              ? "border-[#ff5d5d]/30 bg-[#ff5d5d]/10 text-[#ff8a8a]"
              : "border-white/15 bg-white/[0.07] text-emerald-300"
          }`}
        >
          {tone === "bad" ? <AlertTriangle size={13} /> : <CheckCircle2 size={14} />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium text-white">{title}</span>
          <span className="block truncate text-[12.5px] text-white/50">{detail}</span>
        </span>
        <ChevronRight size={15} className="ml-auto shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" />
      </Link>
    </li>
  );
}

function KpiCard({
  href, icon: Icon, title, big, sub, visual, index,
}: {
  href: string; icon: typeof Flame; title: string; big: string; sub: string; visual: React.ReactNode; index: number;
}) {
  return (
    <Link href={href} className={`glass lift enter enter-${index} group block p-4 sm:p-5`}>
      <div className="flex items-center gap-2 text-white/55">
        <Icon size={14} aria-hidden="true" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em]">{title}</span>
        <ArrowRight size={13} aria-hidden="true" className="ml-auto text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white" />
      </div>
      <div className="font-display mt-2 text-[34px] font-semibold leading-none tracking-tight tabular text-white">
        {big}
      </div>
      <div className="mt-1 text-[12px] text-white/50">{sub}</div>
      <div className="mt-3 border-t border-white/10 pt-3">{visual}</div>
    </Link>
  );
}

function ExploreRow({ title, summary, href, icon: Icon, ai }: { title: string; summary: string; href: string; icon: typeof Flame; ai?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:bg-white/[0.05]">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.07] text-white/70 transition-colors group-hover:bg-white group-hover:text-black">
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
        {title}
        {ai && (
          <span className="rounded-full bg-white/[0.1] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white/60">
            AI
          </span>
        )}
      </span>
      <span className="ml-auto truncate text-[12.5px] tabular text-white/50">{summary}</span>
      <ArrowRight size={15} aria-hidden="true" className="shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
    </Link>
  );
}

function SectionIntro({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-1 pt-2">
      <h2 className="font-display text-[24px] font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-0.5 text-[13.5px] text-white/55">{sub}</p>
    </div>
  );
}

function MasterHeater({ values }: { values: Record<string, number> }) {
  const heatOn = on(values, "heater_on");
  const inTol = HEATERS.filter((h) => on(values, `${h.prefix}_tol`)).length;
  const worst = HEATERS.map((h) => {
    const t = num(values, `${h.prefix}_temp`);
    const s = num(values, `${h.prefix}_set`);
    return { h, d: t != null && s != null ? t - s : undefined };
  }).sort((a, b) => (a.d ?? 0) - (b.d ?? 0))[0];
  return (
    <div className="glass-soft flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
      <div>
        <div className="text-[12px] text-white/45">Master heater</div>
        <div className={`mt-0.5 text-[15px] font-bold ${heatOn ? "text-emerald-300" : "text-white/70"}`}>
          {heatOn == null ? "—" : heatOn ? "On" : "Off"}
        </div>
      </div>
      <div>
        <div className="text-[12px] text-white/45">Zones in tolerance</div>
        <div className="mt-0.5 text-[15px] font-bold tabular text-white">{inTol} of 4</div>
      </div>
      <div className="ml-auto text-[12.5px] text-white/50">
        {worst?.d != null
          ? <>Coldest · {worst.h.label} ({worst.d >= 0 ? `+${worst.d.toFixed(1)}°` : `${worst.d.toFixed(1)}°`})</>
          : "Deviation unavailable"}
        {values.fault_code ? <> · <span className="font-semibold text-[#ff8a8a]">Fault {Math.round(values.fault_code)}</span></> : null}
      </div>
    </div>
  );
}
