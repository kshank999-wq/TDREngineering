import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
import { env } from "@/lib/env";
import { site, hasAddress, hasPhone } from "@/content/site";

export const metadata: Metadata = {
  title: "Contact",
  // The phone number is only named in the description once it is known.
  description: hasPhone
    ? `Contact TDR Engineering — call ${site.phone}, email ${site.email}, or send a message about land surveying, civil engineering or 3D scanning.`
    : `Contact TDR Engineering — email ${site.email} or send a message about land surveying, civil engineering or 3D scanning.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Talk to TDR."
        intro="Questions about scope, scheduling, or whether scanning makes sense for your project? Get in touch and a member of the team will follow up."
      />

      <div className="bg-ink-50 py-16 md:py-20">
        <div className="container-tdr grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
          <ContactForm turnstileSiteKey={env.turnstileSiteKey} />

          <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-xl border border-ink-100 bg-white p-7 shadow-panel">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-500">
                Reach TDR directly
              </h2>
              {/* Unverified facts are omitted, not rendered as placeholders —
                  a missing office block is recoverable, a wrong address is not. */}
              <ul className="mt-5 space-y-4">
                {hasPhone ? (
                  <li>
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                      Phone
                    </span>
                    <a
                      href={site.phoneHref}
                      className="mt-1 block font-semibold text-ink-900 hover:text-brand-500"
                    >
                      {site.phone}
                    </a>
                  </li>
                ) : null}
                <li>
                  <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                    Email
                  </span>
                  <a
                    href={`mailto:${site.email}`}
                    className="mt-1 block font-semibold text-ink-900 hover:text-brand-500"
                  >
                    {site.email}
                  </a>
                </li>
                {hasAddress ? (
                  <li>
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                      Office
                    </span>
                    <address className="mt-1 text-sm leading-relaxed text-ink-700 not-italic">
                      {site.address.street}
                      {site.address.street2 ? (
                        <>
                          <br />
                          {site.address.street2}
                        </>
                      ) : null}
                      <br />
                      {site.address.city}, {site.address.region} {site.address.postalCode}
                    </address>
                  </li>
                ) : null}
                {site.hours ? (
                  <li>
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                      Hours
                    </span>
                    <p className="mt-1 text-sm text-ink-700">{site.hours}</p>
                  </li>
                ) : null}
              </ul>
            </div>

            <div className="rounded-xl border border-accent-500/30 bg-accent-500/10 p-7">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-600">
                Ready for a proposal?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Skip the back-and-forth. The proposal form collects the project
                details TDR needs to quote accurately.
              </p>
              <Link
                href="/request-a-proposal"
                className="mt-5 inline-flex rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500"
              >
                Request a Proposal
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
