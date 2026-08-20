import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  // Before the Supabase project is wired up there is nothing to sign in to.
  // Say so plainly rather than presenting a form that cannot work.
  if (!isSupabaseConfigured()) {
    return (
      <div className="container-tdr flex min-h-[70vh] items-center justify-center py-16">
        <div className="w-full max-w-md rounded-xl border border-amber-300 bg-amber-50 p-7">
          <h1 className="text-lg font-bold text-amber-900">
            Internal area not configured
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-amber-800">
            NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not
            set for this deployment, so there is no database to sign in to. See
            docs/DEPLOYMENT.md and supabase/README.md.
          </p>
          <p className="mt-3 text-sm text-amber-800">
            The public website and the proposal form are unaffected by this
            message only if Supabase is configured — check the deployment
            environment variables before launch.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-tdr flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-ink-900">TDR internal sign in</h1>
        <p className="mt-2 text-sm text-ink-600">
          For TDR staff. Accounts are created by a TDR administrator in Supabase.
        </p>
        <div className="mt-8">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
