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
    <div className="enter mx-auto mt-10 max-w-sm pb-16 sm:mt-16">
      <div className="black-card p-7 sm:p-8">
        <div className="relative z-10">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[18px] font-bold text-black">P</span>
            <span className="font-display text-[18px] font-semibold tracking-tight text-white">paceai</span>
          </div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight text-white">Operator login</h1>
          <p className="mt-1 text-[13px] text-white/50">Read-only diagnostics for the Orion line.</p>
          {demoMode && <p className="mb-1 mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-sm text-white/75">Demo mode is on — no account needed. Just sign in.</p>}
          <form onSubmit={submit} className="mt-4 space-y-3">
            <input name="email" type="email" required placeholder="Email" aria-label="Email"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/35" />
            <input name="password" type="password" required placeholder="Password" aria-label="Password"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/35" />
            {err && <p className="text-sm text-[#ff8a8a]">{err}</p>}
            <button className="w-full rounded-full bg-white py-2.5 text-sm font-semibold text-black shadow-[0_0_28px_rgba(255,255,255,0.25)] transition-transform hover:scale-[1.01] active:scale-[0.99]">Sign in</button>
          </form>
        </div>
      </div>
    </div>
  );
}
