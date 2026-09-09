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
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1d1d1f] text-[16px] font-semibold text-white">P</span>
        <span className="font-display text-[17px] font-semibold tracking-tight">PaceAI</span>
      </div>
      <h1 className="font-display text-[22px] font-semibold tracking-tight">Operator login</h1>
      {demoMode && <p className="mb-3 mt-3 rounded-2xl bg-[#0071e3]/[0.07] p-3.5 text-sm text-[#0071e3]">Demo mode is enabled; no account is required.</p>}
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input name="email" type="email" required placeholder="Email"
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-[#6e6e73] focus:border-[#0071e3]" />
        <input name="password" type="password" required placeholder="Password"
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-[#6e6e73] focus:border-[#0071e3]" />
        {err && <p className="text-sm text-[#d70015]">{err}</p>}
        <button className="w-full rounded-full bg-[#1d1d1f] py-2.5 text-sm font-medium text-white">Sign in</button>
      </form>
    </div>
  );
}
