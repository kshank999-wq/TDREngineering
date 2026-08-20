import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, requireEnv } from "@/lib/env";

/**
 * Service-role Supabase client. Bypasses Row Level Security, so it may only be
 * imported from server code — the `server-only` import above turns any
 * accidental client import into a build error.
 *
 * Used by the proposal intake route, which has to create contacts, companies,
 * properties, opportunities and referrals on behalf of an anonymous visitor.
 */
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    requireEnv(env.supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(env.supabaseServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cached;
}
