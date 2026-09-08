"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type ApiEvent, type History } from "@/lib/api";
import { MetricHistoryChart } from "@/components/charts/MetricHistoryChart";

const RANGES = [{ d: 1, label: "24h" }, { d: 7, label: "7d" }, { d: 30, label: "30d" }];
const TEMP_KEYS = ["hor_front_temp", "hor_rear_temp", "vert1_temp", "vert2_temp"];

export default function HistoryPage() {
  const { key } = useParams<{ key: string }>();
  const [days, setDays] = useState(1);
  const [hist, setHist] = useState<History | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);

  useEffect(() => {
    const until = new Date();
    const since = new Date(+until - days * 86400_000);
    api.history(key, since.toISOString(), until.toISOString()).then(setHist).catch(() => {});
    api.events(key).then(setEvents).catch(() => {});
  }, [key, days]);

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-bold">History — {key}</h1>
        {RANGES.map((r) => (
          <button key={r.d} onClick={() => setDays(r.d)}
            className={`rounded px-2 py-1 text-sm ${days === r.d ? "bg-emerald-600" : "bg-zinc-800"}`}>
            {r.label}
          </button>
        ))}
        <span className="text-xs text-zinc-500">{hist ? `${hist.resolution} · ${hist.points.length} pts` : ""}</span>
      </header>
      {hist && <MetricHistoryChart points={hist.points} keys={TEMP_KEYS} events={events} />}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">Events</h2>
        <ul className="space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1">
              <span className="text-zinc-500">{new Date(e.ts).toLocaleString()}</span>{" "}
              <b className={e.severity === "info" ? "text-zinc-300" : "text-amber-300"}>{e.event_type}/{e.severity}</b>{" "}
              <span className="text-zinc-400">{JSON.stringify(e.data)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
