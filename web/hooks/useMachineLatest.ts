"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type MachineState } from "@/lib/api";

const unknownState = (key: string): MachineState => ({
  machine_key: key, freshness: "unknown", source_ts: null, age_seconds: null,
  values: {}, quality: {}, collector_connected: false, info: {}, titles: {},
});

// 1s active / 10s hidden, instant refresh on focus. Values never silently freeze:
// staleness is always visible via the state's own freshness + age.
export function useMachineLatest(key: string) {
  const [state, setState] = useState<MachineState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();

  const tick = useCallback(async () => {
    try {
      setState(await api.latest(key));
      setError(null);
    } catch (e) {
      setState(unknownState(key));
      setError(e instanceof Error ? e.message : "fetch_failed");
    }
  }, [key]);

  useEffect(() => {
    tick();
    const arm = () =>
      (timer.current = setInterval(tick, document.hidden ? 10_000 : 1_000));
    arm();
    const onVis = () => {
      clearInterval(timer.current);
      if (!document.hidden) tick();
      arm();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, [tick]);

  return { state, error };
}
