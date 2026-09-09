"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { AXES, HEATERS, MACHINES, num, on } from "@/components/cockpit/meta";
import { FreshnessBadge } from "@/components/cockpit/FreshnessBadge";
import { HeaterZoneCard } from "@/components/cockpit/HeaterZoneCard";
import { ServoAxisCard } from "@/components/cockpit/ServoAxisCard";
import { MachineInfoCard, MachineStatusCard } from "@/components/cockpit/MachinePanels";
import { OeePanel } from "@/components/cockpit/OeePanel";
import { HistoryView } from "@/components/cockpit/HistoryView";
import { AssistantPanel } from "@/components/copilot/AssistantPanel";
import { useLiveSeries } from "@/components/cockpit/useLiveSeries";
import { StreamChart } from "@/components/cockpit/StreamChart";
import { DeviationBullet, Ring } from "@/components/cockpit/HealthRings";
import { VIEWS, type ViewId } from "@/components/layout/AppSidebar";
import { useMachineLatest } from "@/hooks/useMachineLatest";
import { demoMode } from "@/lib/api";

const VALID: ViewId[] = ["overview", "heaters", "drives", "production", "system", "history", "assistant"];

export default function CockpitPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#6e6e73]">Loading…</p>}>
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
  const machine = MACHINES.find((m) => m.key === key);

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

  // Live stream inputs: one snapshot per telemetry tick.
  const tempSnapshot = useMemo(
    () => HEATERS.map((h) => num(v, `${h.prefix}_temp`)),
    // Rebuilt whenever a new snapshot arrives (state identity changes per tick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );
  const parsed = state?.source_ts ? Date.parse(state.source_ts) : NaN;
  const live = useLiveSeries(key, Number.isFinite(parsed) ? parsed : null, tempSnapshot);
  const faultIndex = (() => {
    const i = HEATERS.findIndex((h) => on(v, `${h.prefix}_tol`) === false);
    return i >= 0 ? i : null;
  })();
  const worstDelta = HEATERS.map((h) => {
    const t = num(v, `${h.prefix}_temp`);
    const s = num(v, `${h.prefix}_set`);
    return t != null && s != null ? t - s : undefined;
  })
    .filter((d): d is number => d != null)
    .sort((a, b) => Math.abs(b) - Math.abs(a))[0];

  return (
    <div className="space-y-5 pb-16">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">
            {machine?.name ?? key}
          </h1>
          {state && <FreshnessBadge freshness={state.freshness} age={state.age_seconds} />}
        </div>
        {tab !== "overview" && (
          <p className="text-[13.5px] text-[#6e6e73]">
            {tabLabel(tab).tagline}
          </p>
        )}
        {/* Mobile section nav — the sidebar covers this on desktop */}
        <nav className="flex gap-2 overflow-x-auto pb-1 pt-1 lg:hidden">
          {VIEWS.map((view) => (
            <Link
              key={view.id}
              href={`/machines/${key}?tab=${view.id}`}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium ${
                tab === view.id ? "bg-[#1d1d1f] text-white" : "bg-black/[0.04] text-[#515154]"
              }`}
            >
              {view.label}
            </Link>
          ))}
        </nav>
      </header>

      {tab === "overview" && (
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="p-6 pb-2 sm:p-8 sm:pb-3">
              <div className="flex items-center gap-2">
                {hasAttention ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d70015]/[0.07] px-3 py-1 text-[12.5px] font-medium text-[#d70015]">
                    <AlertCircle size={14} aria-hidden="true" /> Needs attention
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1d8127]/10 px-3 py-1 text-[12.5px] font-medium text-[#1d8127]">
                    <CheckCircle2 size={14} aria-hidden="true" /> Running normally
                  </span>
                )}
              </div>
              <h2 className="font-display mt-3 max-w-[28ch] text-[24px] font-semibold leading-[1.15] tracking-tight sm:text-[30px]">
                {heroHeadline(hasAttention, heaterIssues, driveFaults, faultCode)}
              </h2>
            </div>
            <div className="px-3 sm:px-5">
              <StreamChart
                series={live}
                labels={HEATERS.map((h) => h.label)}
                sets={HEATERS.map((h) => num(v, `${h.prefix}_set`))}
                faultIndex={faultIndex}
              />
            </div>
            <div className="mt-3 grid gap-4 border-t border-black/[0.05] p-5 sm:grid-cols-3 sm:p-6">
              <Ring value={inTol} max={4} label="Heater zones in tolerance" />
              <Ring value={healthy} max={6} label="Servo axes healthy" />
              <DeviationBullet delta={worstDelta} />
            </div>
          </section>

          {hasAttention && (
            <section className="card divide-y divide-black/[0.05] p-2">
              {heaterIssues.map((i) => (
                <IssueRow key={i.label} title={i.label} detail={i.detail} href={`/machines/${key}?tab=heaters`} />
              ))}
              {driveFaults.map((i) => (
                <IssueRow key={i.label} title={i.label} detail={i.detail} href={`/machines/${key}?tab=drives`} />
              ))}
              {faultCode ? (
                <IssueRow title={`Fault code ${Math.round(faultCode)}`} detail="See production for context" href={`/machines/${key}?tab=production`} />
              ) : null}
              {state?.collector_connected === false && (
                <div className="flex items-center gap-3 px-4 py-3.5 text-[13.5px]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#d70015]" />
                  <div>
                    <div className="font-medium">Telemetry unavailable</div>
                    <div className="text-[#6e6e73]">Showing last known values, not live data.</div>
                  </div>
                </div>
              )}
            </section>
          )}

          <section aria-label="Explore" className="card divide-y divide-black/[0.05] p-2">
            <ExploreRow
              href={`/machines/${key}?tab=heaters`}
              title="Heaters"
              summary={`${inTol} of 4 in tolerance`}
            />
            <ExploreRow
              href={`/machines/${key}?tab=drives`}
              title="Drives"
              summary={`${healthy} of 6 healthy`}
            />
            <ExploreRow
              href={`/machines/${key}?tab=production`}
              title="Production"
              summary={prod == null ? "—" : `${Math.round(prod).toLocaleString()} bags left`}
            />
            <ExploreRow
              href={`/machines/${key}?tab=assistant`}
              title="Assistant"
              summary={faultCode ? `Ask about fault ${Math.round(faultCode)}` : "Ask about this machine"}
            />
          </section>

          <p className="px-1 text-[12px] text-[#6e6e73]">
            {demoMode ? "Demo data · simulated snapshot updates every second." : "Live controller telemetry."}
            {info.date_time ? ` · PLC ${info.date_time}` : ""}
          </p>
        </div>
      )}

      {tab === "heaters" && (
        <div className="space-y-4">
          <SectionIntro title="Heaters" sub="Setpoint, output and tolerance per zone. Anything out of tolerance sorts itself to your attention on the overview." />
          <MasterHeater values={v} />
          <div className="grid gap-3.5 sm:grid-cols-2">
            {HEATERS.map((h) => <HeaterZoneCard key={h.prefix} prefix={h.prefix} label={h.label} values={v} />)}
          </div>
        </div>
      )}

      {tab === "drives" && (
        <div className="space-y-4">
          <SectionIntro title="Servo drives" sub="Speed, load and health per axis. Faulted axes show their controller error." />
          <div className="grid gap-3.5 sm:grid-cols-2">
            {AXES.map((a) => (
              <ServoAxisCard key={a.prefix} prefix={a.prefix} label={a.label} hasPos={a.hasPos}
                values={v} errorText={info[`${a.prefix}_error_text`]} />
            ))}
          </div>
        </div>
      )}

      {tab === "production" && (
        <div className="space-y-4">
          <SectionIntro title="Production" sub="Output, scrap and where shift time is going." />
          <OeePanel values={v} titles={titles} />
        </div>
      )}

      {tab === "system" && (
        <div className="space-y-4">
          <SectionIntro title="System" sub="Machine identity and live controller signals." />
          <MachineInfoCard values={v} info={info} />
          <MachineStatusCard values={v} />
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-4">
          <SectionIntro title="History" sub="Trends and events. Red ticks mark events on the timeline." />
          <HistoryView machineKey={key} />
        </div>
      )}

      {tab === "assistant" && (
        <div className="space-y-4">
          <SectionIntro title="Assistant" sub="Ask about this machine — answers cite the manual and live values." />
          <AssistantPanel machineKey={key} />
        </div>
      )}
    </div>
  );
}

function tabLabel(tab: ViewId): { tagline: string } {
  switch (tab) {
    case "heaters": return { tagline: "Four zones · setpoint, output and tolerance." };
    case "drives": return { tagline: "Six servo axes · speed, load and health." };
    case "production": return { tagline: "Output, scrap and shift time." };
    case "system": return { tagline: "Identity, state and controller signals." };
    case "history": return { tagline: "Trends and events over time." };
    case "assistant": return { tagline: "Grounded answers from telemetry and manuals." };
    default: return { tagline: "At a glance — is everything running well?" };
  }
}

function heroHeadline(
  hasAttention: boolean,
  heaterIssues: { label: string; detail: string }[],
  driveFaults: { label: string }[],
  faultCode: number | undefined,
): string {
  if (!hasAttention) return "Everything looks good.";
  if (heaterIssues.length > 0) return `${heaterIssues[0].label} needs attention.`;
  if (driveFaults.length > 0) return `${driveFaults[0].label} has a fault.`;
  if (faultCode) return `Fault ${Math.round(faultCode)} is active.`;
  return "Connection to the machine is down.";
}

function ExploreRow({ title, summary, href }: { title: string; summary: string; href: string }) {
  return (
    <Link href={href} className="group flex items-baseline gap-3 px-4 py-3">
      <span className="text-[13.5px] font-medium">{title}</span>
      <span className="ml-auto truncate text-[12.5px] tabular text-[#6e6e73]">{summary}</span>
      <ArrowRight size={15} aria-hidden="true" className="shrink-0 self-center text-[#6e6e73] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function IssueRow({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 px-4 py-3.5">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[#d70015]" />
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium">{title}</div>
        <div className="text-[12.5px] text-[#6e6e73]">{detail}</div>
      </div>
      <ArrowRight size={15} aria-hidden="true" className="ml-auto shrink-0 text-[#6e6e73] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function SectionIntro({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="font-display text-[20px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-0.5 text-[13.5px] text-[#6e6e73]">{sub}</p>
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
    <div className="card-flat flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
      <div>
        <div className="text-[12px] text-[#6e6e73]">Master heater</div>
        <div className={`mt-0.5 text-[15px] font-semibold ${heatOn ? "text-[#1d8127]" : "text-[#515154]"}`}>
          {heatOn == null ? "—" : heatOn ? "On" : "Off"}
        </div>
      </div>
      <div>
        <div className="text-[12px] text-[#6e6e73]">Zones in tolerance</div>
        <div className="mt-0.5 text-[15px] font-semibold tabular">{inTol} of 4</div>
      </div>
      <div className="ml-auto text-[12.5px] text-[#6e6e73]">
        {worst?.d != null
          ? <>Coldest zone · {worst.h.label} ({worst.d >= 0 ? `+${worst.d.toFixed(1)}°` : `${worst.d.toFixed(1)}°`})</>
          : "Zone deviation unavailable"}
        {values.fault_code ? <> · <span className="font-medium text-[#d70015]">Fault {Math.round(values.fault_code)}</span></> : null}
      </div>
    </div>
  );
}
