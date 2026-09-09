"use client";

import { useEffect, useState } from "react";
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

export function HistoryView({ machineKey }: { machineKey: string }) {
  const [days, setDays] = useState(1);
  const [group, setGroup] = useState(GROUPS[0].id);
  const [hist, setHist] = useState<History | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const keys = GROUPS.find((g) => g.id === group)?.keys ?? GROUPS[0].keys;

  useEffect(() => {
    const until = new Date();
    const since = new Date(+until - days * 86400_000);
    api.history(machineKey, since.toISOString(), until.toISOString()).then(setHist).catch(() => {});
    api.events(machineKey).then(setEvents).catch(() => {});
  }, [machineKey, days]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-black/[0.04] p-1">
          {RANGES.map((r) => (
            <button key={r.d} onClick={() => setDays(r.d)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${days === r.d ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#515154]"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-[#6e6e73]">
          {hist ? `${hist.resolution} · ${hist.points.length} points` : ""}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {GROUPS.map((g) => (
          <button key={g.id} onClick={() => setGroup(g.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium ${
              group === g.id ? "bg-[#1d1d1f] text-white" : "bg-black/[0.04] text-[#515154] hover:bg-black/[0.06]"
            }`}>
            {g.label}
          </button>
        ))}
      </div>

      {hist && <MetricHistoryChart points={hist.points} keys={keys} events={events} />}

      <section className="card p-5 sm:p-6">
        <h2 className="font-display mb-3 text-[16px] font-semibold tracking-tight">Events</h2>
        {events.length === 0 ? (
          <p className="text-[13.5px] text-[#6e6e73]">No events in this window. The line has been quiet.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-[13px]">
                <span className="text-[#6e6e73] tabular">{new Date(e.ts).toLocaleString()}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${e.severity === "info" ? "bg-black/[0.05] text-[#515154]" : "bg-[#b45309]/10 text-[#b45309]"}`}>
                  {e.event_type}
                </span>
                <span className="w-full font-mono text-[12px] text-[#515154]">{JSON.stringify(e.data)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
