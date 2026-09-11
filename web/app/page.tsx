"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useMachineLatest } from "@/hooks/useMachineLatest";
import { VffsArt } from "@/components/fleet/VffsArt";
import { AXES, HEATERS, num, on } from "@/components/cockpit/meta";

export default function FleetPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [machines, setMachines] = useState<{ machine_key: string; name: string }[]>([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  useEffect(() => {
    if (user) api.machines().then(setMachines).catch(() => {});
  }, [user]);

  if (loading || !user)
    return (
      <div className="mx-auto grid w-full max-w-[1024px] gap-4 px-1 pt-16 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="glass h-[300px] animate-pulse" aria-hidden="true" />
        ))}
      </div>
    );

  return (
    <div className="mx-auto flex min-h-[72dvh] w-full max-w-[1024px] flex-col justify-center px-1 py-10">
      <p className="enter mb-5 text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">
        Orion line · {machines.length || 2} machines
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {machines.map((m, i) => (
          <MachineCard key={m.machine_key} machineKey={m.machine_key} name={m.name} index={i} />
        ))}
      </div>
    </div>
  );
}

type Tone = "ok" | "bad" | "muted";

function MachineCard({ machineKey, name, index }: { machineKey: string; name: string; index: number }) {
  const { state } = useMachineLatest(machineKey);
  const v = state?.values ?? {};
  const live = state?.freshness === "live";
  const { tone, line } = statusOf(v, state?.collector_connected);

  const glow =
    tone === "ok"
      ? "radial-gradient(closest-side, rgba(52,211,153,0.22), transparent)"
      : tone === "bad"
        ? "radial-gradient(closest-side, rgba(255,93,93,0.24), transparent)"
        : "radial-gradient(closest-side, rgba(255,255,255,0.10), transparent)";

  return (
    <Link
      href={`/machines/${machineKey}?tab=overview`}
      aria-label={`Open ${name} cockpit — ${line}`}
      className={`glass lift enter ${index === 0 ? "enter-1" : "enter-2"} group relative block min-h-[340px] overflow-hidden p-6 sm:min-h-[380px] sm:p-7`}
    >
      <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72" style={{ background: glow }} />
      <div
        aria-hidden="true"
        className="font-display pointer-events-none absolute -bottom-4 right-4 select-none text-[104px] font-bold leading-none tabular text-white/[0.07]"
      >
        {String(index + 1).padStart(2, "0")}
      </div>

      <div className="relative flex h-full min-h-[inherit] flex-col">
        <div className="flex items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
              live
                ? "border-emerald-300/25 bg-emerald-300/15 text-emerald-100"
                : "border-white/10 bg-white/10 text-white/60"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-300 live-dot" : "bg-white/50"}`} />
            {live ? "Live" : "Standby"}
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/50 transition-all duration-300 group-hover:border-white group-hover:bg-white group-hover:text-black">
            <ArrowUpRight size={16} aria-hidden="true" />
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center py-4">
          <VffsArt tone={tone} />
        </div>

        <div className="pt-2">
          <div className="font-display text-[26px] font-semibold leading-tight tracking-tight text-white sm:text-[30px]">
            {name}
          </div>
          <div
            className={`mt-1.5 flex items-center gap-2 text-[13.5px] font-medium ${
              tone === "ok" ? "text-emerald-200/90" : tone === "bad" ? "text-[#ff9a9a]" : "text-white/50"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                tone === "ok" ? "bg-emerald-300" : tone === "bad" ? "bg-[#ff5d5d] fault-dot" : "bg-white/40"
              }`}
            />
            {line}
          </div>
        </div>
      </div>
    </Link>
  );
}

function statusOf(
  v: Record<string, number>,
  connected: boolean | undefined,
): { tone: Tone; line: string } {
  if (connected === false) return { tone: "bad", line: "Telemetry unavailable" };
  const heater = HEATERS.find((h) => on(v, `${h.prefix}_tol`) === false);
  if (heater) {
    const t = num(v, `${heater.prefix}_temp`);
    const s = num(v, `${heater.prefix}_set`);
    const d = t != null && s != null ? t - s : undefined;
    return {
      tone: "bad",
      line:
        d == null
          ? `${heater.label} needs attention`
          : `${heater.label} · ${Math.abs(d).toFixed(1)}° ${d < 0 ? "below" : "above"} set`,
    };
  }
  const drive = AXES.find((a) => {
    const err = num(v, `${a.prefix}_error_id`) ?? 0;
    return err !== 0 && on(v, `${a.prefix}_error_active`) === true;
  });
  if (drive) {
    const id = Math.round(num(v, `${drive.prefix}_error_id`) ?? 0);
    return { tone: "bad", line: `${drive.prefix.toUpperCase()} · Error ${id}` };
  }
  const fault = num(v, "fault_code");
  if (fault) return { tone: "bad", line: `Fault ${Math.round(fault)} active` };
  if (Object.keys(v).length === 0) return { tone: "muted", line: "Connecting…" };
  return { tone: "ok", line: "Running normally" };
}
