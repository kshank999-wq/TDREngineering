import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/env";
import { PortalLoginForm } from "@/components/portal/login-form";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * The portal's own sign-in. Deliberately not shared with /admin/login: a
 * client should never be shown a door into the internal system, and the two
 * send you to different places afterwards.
 */
export default function PortalLoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-50 px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto mb-8 flex w-fit items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded bg-brand-600 text-sm font-bold text-white">
            TDR
          </span>
          <span className="font-bold tracking-tight text-ink-900">TDR Engineering</span>
        </Link>

        <div className="rounded-xl border border-ink-200 bg-white p-7">
          <h1 className="text-xl font-bold text-ink-900">Your projects</h1>
          <p className="mt-1 mb-6 text-sm text-ink-600">
            Sign in to see your survey work, drawings and invoices.
          </p>

          {isSupabaseConfigured() ? (
            <Suspense fallback={null}>
              <PortalLoginForm />
            </Suspense>
          ) : (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              The portal is not configured for this deployment yet.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-ink-500">
          Need access?{" "}
          <a href={`mailto:${site.email}`} className="font-medium text-brand-600 hover:underline">
            Ask your TDR contact
          </a>
        </p>
      </div>
    </div>
  );
}
