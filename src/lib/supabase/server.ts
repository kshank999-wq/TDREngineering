import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, requireEnv, isSupabaseConfigured } from "@/lib/env";

/**
 * Request-scoped Supabase client that carries the signed-in staff user's
 * session. All reads through this client are subject to Row Level Security,
 * which is what protects the admin area's data.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv(env.supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(env.supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set({ name, value, ...options }),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled by middleware instead.
          }
        },
      },
    },
  );
}

export type StaffUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
};

/**
 * Returns the signed-in staff user, or null when the visitor is not
 * authenticated or has no active non-client `app_users` row.
 */
export async function getStaffUser(): Promise<StaffUser | null> {
  // Without Supabase credentials there is no session to read and no staff user
  // to authorize. Returning null sends the caller to the sign-in page instead
  // of throwing a 500 out of a server component.
  if (!isSupabaseConfigured()) return null;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("app_users")
    .select("id, email, full_name, role, is_active, archived_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || !data.is_active || data.archived_at || data.role === "client") {
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
  };
}
