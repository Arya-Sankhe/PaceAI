"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { demoMode } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (demoMode) { router.replace("/"); return; }
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase().auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    if (error) setErr("Invalid credentials.");
    else router.replace("/");
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-4 text-xl font-bold">Operator login</h1>
      {demoMode && <p className="mb-3 rounded border border-sky-500/40 bg-sky-500/10 p-2 text-sm text-sky-200">Demo mode is enabled; no account is required.</p>}
      <form onSubmit={submit} className="space-y-3">
        <input name="email" type="email" required placeholder="Email"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm" />
        <input name="password" type="password" required placeholder="Password"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm" />
        {err && <p className="text-sm text-red-300">{err}</p>}
        <button className="w-full rounded bg-emerald-600 py-2 text-sm font-medium">Sign in</button>
      </form>
    </div>
  );
}
