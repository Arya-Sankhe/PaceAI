import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ponytail: lazy singleton — module-level createClient crashes `next build` prerender
// (env absent) and every SSR import. Browser holds Auth only — never service keys.
let _sb: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _sb;
}
