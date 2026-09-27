"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { api, type SourceStatus } from "@/lib/api";

/** Live PLC ⇄ demo data. Flips the API's source for everyone, then reloads so
 *  no chart keeps samples from the other source. */
export function DataSourceSwitch({ collapsed }: { collapsed: boolean }) {
  const [status, setStatus] = useState<SourceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.source().then((s) => alive && setStatus(s)).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const live = status?.mode === "plc";
  const links = Object.values(status?.machines ?? {});
  const connected = links.some((m) => m.connected);
  const tone = !live ? "#a1a1aa" : connected ? "#4ade80" : "#fbbf24";
  const detail = !status
    ? "…"
    : !live
      ? "Simulated values"
      : connected
        ? "Live · connected"
        : "Live · connecting";
  const label = live ? "Live machine data" : "Demo data";

  const flip = async () => {
    if (!status || busy) return;
    setBusy(true);
    setError(false);
    try {
      await api.setSource(live ? "dummy" : "plc");
      window.location.reload();
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={live}
      aria-label="Use live machine data"
      title={collapsed ? `${label} — click to switch` : `Switch to ${live ? "demo data" : "the live PLC"}`}
      onClick={flip}
      disabled={!status || busy}
      className="side-item disabled:cursor-wait"
    >
      <span className="side-icon relative">
        <Radio size={15} strokeWidth={2} aria-hidden="true" />
        <span
          aria-hidden="true"
          className={`absolute right-[3px] top-[3px] h-[7px] w-[7px] rounded-full ${live && connected ? "live-dot" : ""}`}
          style={{ background: tone }}
        />
      </span>
      <span className="side-label min-w-0 !flex-col !items-start !gap-0 text-left leading-tight">
        <span className="truncate">{live ? "Live PLC" : "Demo data"}</span>
        <span className={`truncate text-[10.5px] font-medium ${error ? "text-[#ff6b6b]" : "text-white/40"}`}>
          {error ? "Couldn’t switch" : busy ? "Switching…" : detail}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`side-extra ml-auto flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-[2px] transition-colors ${live ? "bg-[#4ade80]" : "bg-white/15"}`}
      >
        <span className={`h-[14px] w-[14px] rounded-full bg-white shadow transition-transform ${live ? "translate-x-[12px]" : ""}`} />
      </span>
    </button>
  );
}
