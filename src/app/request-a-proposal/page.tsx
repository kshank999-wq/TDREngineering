import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { ProposalForm } from "@/components/proposal-form";
import { CheckList } from "@/components/ui";
import { env } from "@/lib/env";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Request a Proposal",
  description:
    "Request a proposal from TDR Engineering for land surveying, civil engineering or 3D scanning. No account or login required — tell us about the property and what you need.",
  alternates: { canonical: "/request-a-proposal" },
};

/**
 * Request for Proposal page (spec §7).
 *
 * Explicitly no login: many TDR jobs are one-off residential, boundary,
 * architectural survey or referral-based projects.
 */
export default function RequestProposalPage() {
  return (
    <>
      <PageHeader
        eyebrow="Request a proposal"
        title="Tell us about your project."
        intro="No account, no login. Give us the property and what you are trying to accomplish, and TDR will come back with a scoped proposal — including a recommendation if you are not sure what the project needs."
      />

      <div className="bg-ink-50 py-16 md:py-20">
        <div className="container-tdr grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
          <Suspense fallback={<FormSkeleton />}>
            <ProposalForm turnstileSiteKey={env.turnstileSiteKey} />
          </Suspense>

          <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-xl border border-ink-100 bg-white p-7 shadow-panel">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-500">
                What helps most
              </h2>
              <div className="mt-5">
                <CheckList
                  items={[
                    "The project address, and the APN if you have it",
                    "What you are trying to accomplish",
                    "Any deadline or submittal date",
                    "An existing survey, title report or drawings",
                    "Who referred you, if a professional sent you our way",
                  ]}
                />
              </div>
            </div>

            <div className="rounded-xl border border-ink-100 bg-white p-7 shadow-panel">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-500">
                Prefer to talk?
              </h2>
              <ul className="mt-4 space-y-3 text-ink-800">
                <li>
                  <a href={site.phoneHref} className="font-semibold hover:text-brand-500">
                    {site.phone}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${site.email}`} className="font-semibold hover:text-brand-500">
                    {site.email}
                  </a>
                </li>
                <li className="text-sm text-ink-600">{site.hours}</li>
              </ul>
            </div>

            <div className="rounded-xl border border-accent-500/30 bg-accent-500/10 p-7">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-600">
                Not sure what you need?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Select &ldquo;Other / I&rsquo;m not sure&rdquo; and describe the
                situation. TDR will recommend the survey the project actually
                requires rather than the largest one.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-10 shadow-panel">
      <div className="h-6 w-48 animate-pulse rounded bg-ink-100" />
      <div className="mt-6 space-y-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-ink-50" />
        ))}
      </div>
    </div>
  );
}
