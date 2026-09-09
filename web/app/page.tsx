"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { MACHINES } from "@/components/cockpit/meta";

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
  if (loading || !user) return <p className="text-sm text-[#6e6e73]">Loading…</p>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">Fleet</h1>
        <p className="mt-1 text-[13.5px] text-[#6e6e73]">Two machines on the Orion line. Pick one to see how it&apos;s running.</p>
      </header>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {machines.map((m) => {
          const meta = MACHINES.find((x) => x.key === m.machine_key);
          return (
            <Link key={m.machine_key} href={`/machines/${m.machine_key}?tab=overview`}
              className="card group p-6">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-[#1d8127]" />
                <span className="text-[12.5px] font-medium text-[#1d8127]">Live</span>
              </div>
              <div className="font-display mt-2 text-[20px] font-semibold tracking-tight">{m.name}</div>
              <div className="mt-1 text-[13px] text-[#6e6e73]">{meta?.short ?? m.machine_key} · overview, heaters, drives and more</div>
              <div className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#0071e3]">
                Open cockpit <ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
