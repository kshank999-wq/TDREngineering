"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navigation, site, hasPhone } from "@/content/site";

/**
 * Primary navigation (spec §4).
 *
 * "Client Login" is deliberately absent: the spec forbids exposing unfinished
 * portal functionality at launch.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container-tdr flex h-16 items-center justify-between gap-4 md:h-20">
        <Link href="/" className="flex items-center gap-3" aria-label={`${site.name} home`}>
          {/* TODO(tdr): swap for the official logo file recovered in Phase 1A. */}
          <span className="flex h-9 w-9 items-center justify-center rounded bg-brand-600 text-sm font-bold tracking-tight text-white">
            TDR
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-base font-bold tracking-tight text-ink-900">
              TDR ENGINEERING
            </span>
            <span className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-400">
              Survey · Civil · 3D Scanning
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {navigation
            .filter((item) => item.href !== "/request-a-proposal")
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "text-brand-600"
                    : "text-ink-700 hover:bg-ink-50 hover:text-brand-600"
                }`}
              >
                {item.label}
              </Link>
            ))}
          <Link
            href="/request-a-proposal"
            className="ml-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
          >
            Request a Proposal
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 lg:hidden"
        >
          <span className="sr-only">Toggle navigation</span>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            )}
          </svg>
          Menu
        </button>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Primary mobile"
          className="border-t border-ink-100 bg-white lg:hidden"
        >
          <div className="container-tdr flex flex-col py-3">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`rounded-md px-2 py-3 text-base font-medium ${
                  isActive(item.href) ? "text-brand-600" : "text-ink-800"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {hasPhone ? (
              <a
                href={site.phoneHref}
                className="mt-2 rounded-md bg-ink-50 px-2 py-3 text-base font-medium text-ink-800"
              >
                Call {site.phone}
              </a>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
