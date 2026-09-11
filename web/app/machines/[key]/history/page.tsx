"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type ApiEvent, type History } from "@/lib/api";
import { MetricHistoryChart } from "@/components/charts/MetricHistoryChart";

const RANGES = [{ d: 1, label: "24h" }, { d: 7, label: "7d" }, { d: 30, label: "30d" }];
const GROUPS: { id: string; label: string; keys: string[] }[] = [
  { id: "temps", label: "Heater temps", keys: ["hor_front_temp", "hor_rear_temp", "vert1_temp", "vert2_temp"] },
  { id: "out", label: "Heater output", keys: ["hor_front_output", "hor_rear_output", "vert1_output", "vert2_output"] },
  { id: "rpm", label: "Drive speed", keys: ["bx_rpm", "cs_rpm", "ff_rpm", "pk_rpm", "uw_rpm", "vs_rpm"] },
  { id: "amp", label: "Drive current", keys: ["bx_current", "cs_current", "ff_current", "pk_current", "uw_current", "vs_current"] },
  { id: "dtemp", label: "Drive temps", keys: ["bx_temp", "cs_temp", "ff_temp", "pk_temp", "uw_temp", "vs_temp"] },
  { id: "oee", label: "Production", keys: ["prod_remaining", "planned_dt_remaining", "unplanned_dt_remaining"] },
];

export default function HistoryPage() {
  const { key } = useParams<{ key: string }>();
  const [days, setDays] = useState(1);
  const [group, setGroup] = useState(GROUPS[0].id);
  const [hist, setHist] = useState<History | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const keys = GROUPS.find((g) => g.id === group)?.keys ?? GROUPS[0].keys;

  useEffect(() => {
    const until = new Date();
    const since = new Date(+until - days * 86400_000);
    api.history(key, since.toISOString(), until.toISOString()).then(setHist).catch(() => {});
    api.events(key).then(setEvents).catch(() => {});
  }, [key, days]);

  return (
    <div className="enter mx-auto w-full max-w-[760px] space-y-5 pb-16 pt-4 sm:pt-8">
      <header className="px-1">
        <Link href={`/machines/${key}?tab=overview`} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[13px] font-semibold text-white/70 backdrop-blur transition-colors hover:text-white">
          ← Back to cockpit
        </Link>
        <h1 className="font-display mt-2 text-[26px] font-semibold tracking-tight text-white">History</h1>
        <p className="mt-1 text-[13.5px] text-white/55">Trends and events over time.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-white/10 bg-black/25 p-1 backdrop-blur">
          {RANGES.map((r) => (
            <button key={r.d} onClick={() => setDays(r.d)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all ${days === r.d ? "bg-white text-black shadow" : "text-white/60 hover:text-white"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] tabular text-white/40">{hist ? `${hist.resolution} · ${hist.points.length} points` : ""}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {GROUPS.map((g) => (
          <button key={g.id} onClick={() => setGroup(g.id)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold backdrop-blur transition-all ${
              group === g.id ? "border-white bg-white text-black shadow-lg" : "border-white/10 bg-black/20 text-white/65 hover:text-white"
            }`}>
            {g.label}
          </button>
        ))}
      </div>
      {hist && <MetricHistoryChart points={hist.points} keys={keys} events={events} />}
      <section className="glass p-5 sm:p-6">
        <h2 className="font-display mb-3 text-[16px] font-semibold tracking-tight text-white">Events</h2>
        {events.length === 0 ? (
          <p className="text-[13.5px] text-white/50">No events in this window.</p>
        ) : (
          <ul className="divide-y divide-white/[0.07]">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-[13px]">
                <span className="tabular text-white/40">{new Date(e.ts).toLocaleString()}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11.5px] font-semibold ${e.severity === "info" ? "border-white/10 bg-white/[0.07] text-white/65" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}>
                  {e.event_type}
                </span>
                <span className="w-full font-mono text-[12px] text-white/45">{JSON.stringify(e.data)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
