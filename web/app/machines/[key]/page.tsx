"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AXES, HEATERS } from "@/components/cockpit/meta";
import { FreshnessBadge } from "@/components/cockpit/FreshnessBadge";
import { HeaterZoneCard } from "@/components/cockpit/HeaterZoneCard";
import { ServoAxisCard } from "@/components/cockpit/ServoAxisCard";
import { ProductionCard } from "@/components/cockpit/ProductionCard";
import { ChatSidebar } from "@/components/copilot/ChatSidebar";
import { useMachineLatest } from "@/hooks/useMachineLatest";
import { demoMode } from "@/lib/api";

export default function CockpitPage() {
  const { key } = useParams<{ key: string }>();
  const { state, error } = useMachineLatest(key);
  const v = state?.values ?? {};

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{key === "orion_1" ? "Orion VFFS #1" : "Orion VFFS #2"}</h1>
        {state && <FreshnessBadge freshness={state.freshness} age={state.age_seconds} />}
        <Link href={`/machines/${key}/history`} className="text-sm text-sky-300">History & events →</Link>
        {error && <span className="text-sm text-red-300">{error}</span>}
      </header>

      {demoMode && (
        <p className="rounded border border-sky-500/40 bg-sky-500/10 p-2 text-sm text-sky-200">
          Dummy source · generated snapshot updates every second. Set <code>NEXT_PUBLIC_DEMO_MODE=false</code> to use FastAPI telemetry.
        </p>
      )}

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Current snapshot</h2>
          <span className="text-xs text-zinc-500">{state?.source_ts ? new Date(state.source_ts).toLocaleTimeString() : "No sample timestamp"}</span>
        </div>
        <div className="mt-2 text-sm text-zinc-400">
          {v.fault_code ? <span className="text-red-300">Active fault {v.fault_code} · horizontal front heater</span> : state?.freshness === "unknown" ? "Telemetry unknown — no trusted sample available." : "No active faults reported."}
        </div>
      </section>

      {!state?.collector_connected && (
        <p className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-200">
          {state?.freshness === "unknown" ? "Telemetry unavailable — values below are unknown." : "Collector unreachable — values below are historical, not live."}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">PID heaters</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HEATERS.map((h) => <HeaterZoneCard key={h.prefix} prefix={h.prefix} label={h.label} values={v} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">Servo axes</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AXES.map((a) => <ServoAxisCard key={a.prefix} prefix={a.prefix} label={a.label} values={v} />)}
        </div>
      </section>

      <ProductionCard values={v} />
      <ChatSidebar machineKey={key} />
    </div>
  );
}
