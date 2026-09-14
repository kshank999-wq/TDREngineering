import type { Metadata } from "next";
import { headers } from "next/headers";
import { readProposalByToken, recordView } from "@/lib/proposals/read";
import { clientIp } from "@/lib/proposals/signing";
import { SignPanel } from "@/components/proposal/sign-panel";
import { money } from "@/content/billing";
import { site, hasPhone } from "@/content/site";

/**
 * The page a client opens to read and sign a proposal.
 *
 * Public, and reached only with a token. Everything on it comes from
 * `proposal_for_signing()`, which chooses the columns — so nothing internal
 * can appear here even if somebody later adds a column to `proposals`.
 */

// Never cached, never prerendered. A signing page that served a stale copy
// could show a withdrawn proposal as live, or hide a signature that exists.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Keep it out of search results and out of link previews. A signing link is a
// credential, and a crawler following one would put a proposal in an index.
export const metadata: Metadata = {
  title: "Proposal",
  robots: { index: false, follow: false, nocache: true },
};

function Money({ value, currency }: { value: string; currency: string }) {
  return <>{money(value, currency)}</>;
}

function longDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function Unavailable({ heading, body }: { heading: string; body: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20">
      <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
        <h1 className="text-2xl font-bold text-ink-900">{heading}</h1>
        <p className="mt-4 text-ink-600">{body}</p>
        <p className="mt-6 text-sm text-ink-500">
          {site.name} ·{" "}
          {hasPhone ? (
            <>
              <a className="underline" href={site.phoneHref}>
                {site.phone}
              </a>{" "}
              ·{" "}
            </>
          ) : null}
          <a className="underline" href={`mailto:${site.email}`}>
            {site.email}
          </a>
        </p>
      </div>
    </main>
  );
}

export default async function ProposalSigningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const proposal = await readProposalByToken(token);

  if (!proposal) {
    // Deliberately one message for every failure — expired, revoked,
    // withdrawn, never existed. Telling an unknown visitor which of those it
    // was tells them whether they have found a real link.
    return (
      <Unavailable
        heading="This link is no longer available"
        body="It may have expired, been replaced with a newer proposal, or been withdrawn. Please contact us and we will send you a current one."
      />
    );
  }

  const head = await headers();
  await recordView(token, clientIp(head), head.get("user-agent"));

  const hasLines = proposal.lines.length > 0;
  const settled = proposal.status === "accepted" || proposal.status === "declined";

  return (
    <main className="min-h-screen bg-ink-50 py-8 md:py-14">
      <div className="mx-auto max-w-3xl px-4">
        <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="eyebrow">{site.name}</p>
            <h1 className="mt-1 text-2xl font-bold text-ink-900 md:text-3xl">
              {proposal.title}
            </h1>
          </div>
          <p className="text-sm text-ink-500">{proposal.proposal_number}</p>
        </header>

        {proposal.status === "accepted" ? (
          <div className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50 p-5">
            <p className="font-semibold text-emerald-900">
              Accepted on {longDate(proposal.accepted_at)}
              {proposal.signed_name ? ` by ${proposal.signed_name}` : ""}.
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              This page is your copy. Keep the link — it stays available.
            </p>
          </div>
        ) : null}

        {proposal.status === "declined" ? (
          <div className="mb-6 rounded-lg border border-ink-300 bg-white p-5">
            <p className="font-semibold text-ink-900">
              Declined on {longDate(proposal.declined_at)}.
            </p>
            <p className="mt-1 text-sm text-ink-600">
              If that was not what you meant, please contact us.
            </p>
          </div>
        ) : null}

        {!settled && proposal.is_expired ? (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
            <p className="font-semibold text-amber-900">
              This proposal expired on {longDate(proposal.valid_until)}.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              It can no longer be accepted here. Contact us and we will send you a current
              one — the figures below are kept so you can see what was quoted.
            </p>
          </div>
        ) : null}

        <article className="rounded-lg border border-ink-200 bg-white">
          <div className="grid gap-4 border-b border-ink-100 p-6 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">Prepared for</p>
              <p className="mt-1 font-medium text-ink-900">
                {proposal.company_name ?? proposal.contact_name ?? "—"}
              </p>
              {proposal.company_name && proposal.contact_name ? (
                <p className="text-sm text-ink-600">{proposal.contact_name}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">Project location</p>
              <p className="mt-1 font-medium text-ink-900">
                {proposal.property_address || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">Date issued</p>
              <p className="mt-1 text-ink-900">{longDate(proposal.sent_at)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-500">Valid until</p>
              <p className="mt-1 text-ink-900">{longDate(proposal.valid_until)}</p>
            </div>
          </div>

          {proposal.scope ? (
            <section className="border-b border-ink-100 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                Scope of work
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-ink-800">{proposal.scope}</p>
            </section>
          ) : null}

          {proposal.exclusions ? (
            <section className="border-b border-ink-100 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                Not included
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-ink-800">{proposal.exclusions}</p>
            </section>
          ) : null}

          {hasLines ? (
            <section className="border-b border-ink-100 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Fee</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-left text-ink-500">
                      <th className="py-2 font-medium">Description</th>
                      <th className="py-2 text-right font-medium">Qty</th>
                      <th className="py-2 text-right font-medium">Rate</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.lines.map((line, i) => (
                      <tr key={i} className="border-b border-ink-100">
                        <td className="py-2 pr-3 text-ink-800">{line.description}</td>
                        <td className="py-2 text-right text-ink-600">{Number(line.quantity)}</td>
                        <td className="py-2 text-right text-ink-600">
                          <Money value={line.unit_price} currency={proposal.currency} />
                        </td>
                        <td className="py-2 text-right font-medium text-ink-900">
                          <Money value={line.amount} currency={proposal.currency} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-600">Subtotal</dt>
                  <dd className="text-ink-900">
                    <Money value={proposal.subtotal} currency={proposal.currency} />
                  </dd>
                </div>
                {Number(proposal.tax_amount) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-ink-600">
                      Tax ({(Number(proposal.tax_rate) * 100).toFixed(2)}%)
                    </dt>
                    <dd className="text-ink-900">
                      <Money value={proposal.tax_amount} currency={proposal.currency} />
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-ink-200 pt-1 text-base font-semibold">
                  <dt className="text-ink-900">Total</dt>
                  <dd className="text-ink-900">
                    <Money value={proposal.total} currency={proposal.currency} />
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}

          {proposal.document_file_id ? (
            <section className="border-b border-ink-100 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                Full proposal document
              </h2>
              <p className="mt-2 text-sm text-ink-600">
                The complete proposal, including anything not summarised above.
              </p>
              <a
                href={`/proposal/${token}/document`}
                className="mt-3 inline-flex items-center rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800 hover:bg-ink-50"
              >
                Download the proposal
              </a>
            </section>
          ) : null}

          {proposal.terms ? (
            <section className="p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                Terms
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                {proposal.terms}
              </p>
            </section>
          ) : null}
        </article>

        {!settled && !proposal.is_expired ? (
          <SignPanel
            token={token}
            contactName={proposal.contact_name}
            companyName={proposal.company_name}
          />
        ) : null}

        <footer className="mt-8 text-center text-sm text-ink-500">
          <p>
            Questions? {site.name} ·{" "}
            {hasPhone ? (
              <>
                <a className="underline" href={site.phoneHref}>
                  {site.phone}
                </a>{" "}
                ·{" "}
              </>
            ) : null}
            <a className="underline" href={`mailto:${site.email}`}>
              {site.email}
            </a>
          </p>
          {proposal.content_hash ? (
            // Shown, not hidden: it is the client's own means of checking that
            // the document they signed is the document they are looking at.
            <p className="mt-2 break-all text-xs text-ink-400">
              Document reference {proposal.content_hash}
            </p>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
