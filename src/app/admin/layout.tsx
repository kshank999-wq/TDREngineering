import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Internal", template: "%s | TDR Internal" },
  robots: { index: false, follow: false },
};

/**
 * Internal proposal view shell (spec §10).
 *
 * Deliberately minimal. This is NOT the CRM — it exists so new business data
 * does not become inaccessible while the larger internal system is built.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="border-b border-ink-200 bg-white">
        <div className="container-tdr flex h-14 items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <Link href="/admin/proposals" className="text-sm font-bold tracking-tight text-ink-900">
              TDR Internal
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link href="/admin/proposals" className="text-ink-600 hover:text-ink-900">
                Proposal requests
              </Link>
              <Link href="/admin/clients" className="text-ink-600 hover:text-ink-900">
                Clients
              </Link>
            </nav>
          </div>
          <Link href="/" className="shrink-0 text-sm text-ink-500 hover:text-ink-800">
            View public site →
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
