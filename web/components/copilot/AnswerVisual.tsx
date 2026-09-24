"use client";

import { useEffect, useState } from "react";
import { api, type ApiEvent, type History, type MachineState } from "@/lib/api";
import type { Visual } from "@/hooks/useCopilotStream";
import { MetricHistoryChart } from "@/components/charts/MetricHistoryChart";
import { HeaterZoneCard } from "@/components/cockpit/HeaterZoneCard";
import { OeePanel } from "@/components/cockpit/OeePanel";
import { AXES, HEATERS } from "@/components/cockpit/meta";

const WINDOW_MS: Record<string, number> = {
  "1h": 3_600_000,
  "8h": 28_800_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
};

const TREND_KEYS: Record<string, string[]> = {
  temp_trend: HEATERS.map((h) => `${h.prefix}_temp`),
  drive_speed: AXES.map((a) => `${a.prefix}_rpm`),
};

// The answer only picks WHICH card helps; the numbers come from the same
// endpoints the cockpit reads, so a chart can never show a value the machine
// never sent. Rendered with the cockpit's own widgets, so it looks native.
export function AnswerVisual({ visual, machineKey }: { visual: Visual; machineKey: string }) {
  const [history, setHistory] = useState<{ history: History; events: ApiEvent[] } | null>(null);
  const [state, setState] = useState<MachineState | null>(null);
  const [failed, setFailed] = useState(false);
  const trend = visual.kind in TREND_KEYS;

  useEffect(() => {
    let alive = true;
    const until = new Date();
    const since = new Date(until.getTime() - (WINDOW_MS[visual.window ?? "1h"] ?? WINDOW_MS["1h"]));
    const load = trend
      ? Promise.all([
          api.history(machineKey, since.toISOString(), until.toISOString()),
          api.events(machineKey),
        ]).then(([h, e]) => {
          if (alive) setHistory({ history: h, events: e });
        })
      : api.latest(machineKey).then((s) => {
          if (alive) setState(s);
        });
    void load.catch(() => {
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [machineKey, visual.kind, visual.window, trend]);

  if (failed) return null;
  if (trend) {
    if (!history) return <Loading />;
    return (
      <MetricHistoryChart
        points={history.history.points}
        keys={TREND_KEYS[visual.kind]}
        events={history.events}
      />
    );
  }
  if (!state) return <Loading />;
  if (visual.kind === "zone_status")
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {HEATERS.map((h) => (
          <HeaterZoneCard key={h.prefix} prefix={h.prefix} label={h.label} values={state.values} />
        ))}
      </div>
    );
  return <OeePanel values={state.values} titles={state.titles ?? {}} />;
}

function Loading() {
  return (
    <div className="glass flex items-center justify-center gap-2 px-5 py-10 text-[13px] text-white/45">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
      Loading chart…
    </div>
  );
}
