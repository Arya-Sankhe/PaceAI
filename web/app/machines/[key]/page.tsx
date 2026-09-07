"use client";

import Link from "next/link";
import { AXES, HEATERS } from "@/components/cockpit/meta";
import { FreshnessBadge } from "@/components/cockpit/FreshnessBadge";
import { HeaterZoneCard } from "@/components/cockpit/HeaterZoneCard";
import { ServoAxisCard } from "@/components/cockpit/ServoAxisCard";
import { ProductionCard } from "@/components/cockpit/ProductionCard";
import { HmiLinkBanner } from "@/components/cockpit/HmiLinkBanner";
import { ChatSidebar } from "@/components/copilot/ChatSidebar";
import { useMachineLatest } from "@/hooks/useMachineLatest";

// ponytail: plant host lives here, not in the DB — deployment config, never an identifier.
const HMI_HOST: Record<string, string> = { orion_1: "192.168.213.1", orion_2: "192.168.213.2" };

export default function CockpitPage({ params }: { params: { key: string } }) {
  const { state, error } = useMachineLatest(params.key);
  const v = state?.values ?? {};

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{params.key === "orion_1" ? "Orion VFFS #1" : "Orion VFFS #2"}</h1>
        {state && <FreshnessBadge freshness={state.freshness} age={state.age_seconds} />}
        <Link href={`/machines/${params.key}/history`} className="text-sm text-sky-300">History & events →</Link>
        {error && <span className="text-sm text-red-300">{error}</span>}
      </header>

      {!state?.collector_connected && (
        <p className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-200">
          Collector unreachable — values below are historical, not live.
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
      <HmiLinkBanner host={HMI_HOST[params.key] ?? "192.168.213.1"} />
      <ChatSidebar machineKey={params.key} />
    </div>
  );
}
