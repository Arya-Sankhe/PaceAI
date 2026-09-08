"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { demoMode } from "@/lib/api";

export function useAuth() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (demoMode) {
      setUser({ id: "demo-user", email: "demo@paceai.local" });
      setLoading(false);
      return;
    }
    supabase().auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase().auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading, signOut: () => demoMode ? Promise.resolve() : supabase().auth.signOut() };
}
