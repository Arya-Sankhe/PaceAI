"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

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
  if (loading || !user) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Fleet overview</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {machines.map((m) => (
          <Link key={m.machine_key} href={`/machines/${m.machine_key}`}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-emerald-600">
            <b>{m.name}</b>
            <div className="text-sm text-zinc-500">{m.machine_key} → cockpit</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
