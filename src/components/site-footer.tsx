import Link from "next/link";
import { site, hasAddress, hasPhone } from "@/content/site";
import { categories, servicesByCategory } from "@/content/services";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-ink-800 bg-ink-950 text-ink-200">
      <div className="container-tdr py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded bg-white text-sm font-bold text-ink-950">
                TDR
              </span>
              <span className="text-base font-bold tracking-tight text-white">
                TDR ENGINEERING
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-300">
              {site.tagline}
            </p>
            <Link
              href="/request-a-proposal"
              className="mt-6 inline-flex rounded-md bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-400"
            >
              Request a Proposal
            </Link>
          </div>

          <FooterColumn
            title="Land Surveying"
            links={servicesByCategory("land-surveying")
              .slice(0, 6)
              .map((s) => ({ href: `/services/${s.code}`, label: s.name }))}
          />
          <FooterColumn
            title={categories["3d-scanning"].name}
            links={servicesByCategory("3d-scanning")
              .slice(0, 6)
              .map((s) => ({ href: `/services/${s.code}`, label: s.name }))}
          />

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">
              Contact
            </h2>
            {/* Each entry is omitted until the fact is verified, so an early
                deploy shows a shorter footer rather than placeholder text. */}
            <ul className="mt-4 space-y-3 text-sm text-ink-300">
              {hasPhone ? (
                <li>
                  <a href={site.phoneHref} className="hover:text-white">
                    {site.phone}
                  </a>
                </li>
              ) : null}
              <li>
                <a href={`mailto:${site.email}`} className="hover:text-white">
                  {site.email}
                </a>
              </li>
              {hasAddress ? (
                <li className="pt-1 leading-relaxed">
                  {site.address.street}
                  {site.address.street2 ? (
                    <>
                      <br />
                      {site.address.street2}
                    </>
                  ) : null}
                  <br />
                  {site.address.city}, {site.address.region} {site.address.postalCode}
                </li>
              ) : null}
              {site.hours ? <li className="pt-1">{site.hours}</li> : null}
            </ul>
            <ul className="mt-6 space-y-2 text-sm text-ink-300">
              <li>
                <Link href="/about" className="hover:text-white">
                  About TDR
                </Link>
              </li>
              <li>
                <Link href="/questions" className="hover:text-white">
                  Questions
                </Link>
              </li>
              <li>
                <Link href="/projects" className="hover:text-white">
                  Projects
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-ink-800 pt-8 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.legalName}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p>{site.tagline}</p>
            {/* Staff sign-in. Deliberately kept to a muted footer link rather
                than the main navigation: the nav speaks to prospects, and spec
                §4 asks that login functionality not be prominent at launch.
                `nofollow` plus the /admin disallow in robots.ts keeps it out of
                search results — the actual protection is authentication and
                RLS, not obscurity. */}
            <Link
              href="/admin/login"
              rel="nofollow"
              className="text-ink-500 transition-colors hover:text-ink-300"
            >
              Staff login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">
        {title}
      </h2>
      <ul className="mt-4 space-y-2 text-sm text-ink-300">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
