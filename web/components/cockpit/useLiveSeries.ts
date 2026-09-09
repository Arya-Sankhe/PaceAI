"use client";

import { useEffect, useRef } from "react";

export interface LiveSample {
  t: number;
  vals: (number | undefined)[];
}

// Rolling buffer of the latest snapshots for the live stream chart.
// Pushes one sample per telemetry tick (deduplicated by timestamp so
// StrictMode double-effects can't insert duplicates). Resets on machine change.
export function useLiveSeries(
  machineKey: string,
  t: number | null,
  snapshot: (number | undefined)[],
  max = 120,
): LiveSample[] {
  const ref = useRef<LiveSample[]>([]);

  useEffect(() => {
    ref.current = [];
  }, [machineKey]);

  useEffect(() => {
    if (t == null) return;
    const last = ref.current[ref.current.length - 1];
    if (last && last.t === t) return;
    ref.current = [...ref.current.slice(-(max - 1)), { t, vals: snapshot }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  return ref.current;
}
