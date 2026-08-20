"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Browser Supabase client. Only ever holds the anon key, so every query it
 * makes is filtered by Row Level Security. Used for staff sign-in.
 */
export function supabaseBrowser() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
