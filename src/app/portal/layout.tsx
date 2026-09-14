import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getClientUser, getStaffUser } from "@/lib/supabase/server";
import { PortalSignOut } from "@/components/portal/sign-out";

export const metadata: Metadata = {
  title: { default: "Your projects", template: "%s | TDR Engineering" },
  robots: { index: false, follow: false },
};

/**
 * The client portal shell.
 *
 * Separate from /admin in every sense: its own login, its own layout, and no
 * shared navigation. A client should never see a link into the internal
 * system, and a staff member signing in here is sent to the internal system
 * rather than shown an empty portal.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const client = await getClientUser();

  if (!client) {
    // A signed-in staff member landing here belongs in the internal view.
    const staff = await getStaffUser();
    redirect(staff ? "/admin/proposals" : "/portal/login");
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="border-b border-ink-200 bg-white">
        <div className="container-tdr flex h-16 items-center justify-between gap-4">
          <Link href="/portal" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded bg-brand-600 text-sm font-bold text-white">
              TDR
            </span>
            <span className="text-sm font-bold tracking-tight text-ink-900">
              TDR Engineering
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ink-500 sm:inline">
              {client.fullName || client.email}
            </span>
            <PortalSignOut />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
