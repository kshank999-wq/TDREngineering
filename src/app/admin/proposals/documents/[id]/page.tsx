import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { ProposalEditor } from "@/components/admin/proposal-editor";
import { proposalStateLabel } from "@/content/esign";

export const dynamic = "force-dynamic";

function stamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const eventLabels: Record<string, string> = {
  created: "Created",
  sent: "Sent for signature",
  link_issued: "Another link issued",
  viewed: "Opened by the client",
  downloaded: "Document downloaded",
  accepted: "Accepted and signed",
  declined: "Declined",
  withdrawn: "Withdrawn by TDR",
  link_revoked: "Link revoked",
  note: "Note",
};

export default async function ProposalDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff) notFound();

  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: proposal } = await supabase
    .from("proposals")
    .select(
      `id, proposal_number, opportunity_id, status, title, scope, exclusions, terms, notes,
       valid_until, tax_rate, subtotal, tax_amount, total, currency, content_hash,
       sent_at, accepted_at, declined_at, withdrawn_at, decline_reason,
       contact:contacts!proposals_contact_id_fkey ( id, first_name, last_name, email ),
       company:companies!proposals_company_id_fkey ( id, name ),
       document:files!proposals_document_file_id_fkey ( original_filename )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!proposal) notFound();

  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const contact = one(proposal.contact) as
    | { id: string; first_name?: string; last_name?: string; email?: string }
    | null;
  const company = one(proposal.company) as { id: string; name?: string } | null;
  const document = one(proposal.document) as { original_filename?: string } | null;

  const [{ data: lines }, { data: links }, { data: events }, { data: signature }, { data: board }] =
    await Promise.all([
      supabase
        .from("proposal_lines")
        .select("id, description, quantity, unit_price, amount")
        .eq("proposal_id", id)
        .order("sort_order"),
      supabase
        .from("proposal_access_tokens")
        .select(
          "id, sent_to, created_at, expires_at, revoked_at, first_viewed_at, last_viewed_at, view_count",
        )
        .eq("proposal_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("proposal_events")
        .select("id, kind, detail, occurred_at, ip_address")
        .eq("proposal_id", id)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("proposal_signatures")
        .select(
          "typed_name, signer_email, signer_title, signed_at, ip_address, user_agent, document_hash, consent_text",
        )
        .eq("proposal_id", id)
        .maybeSingle(),
      supabase
        .from("v_proposal_board")
        .select("state, signature_mismatch, job_id, job_number")
        .eq("id", id)
        .maybeSingle(),
    ]);

  const state = (board?.state as string) ?? proposal.status;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">
            <Link href="/admin/proposals/documents" className="underline">
              Proposals
            </Link>{" "}
            / {proposal.proposal_number}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">{proposal.title}</h1>
          <p className="mt-1 text-sm text-ink-600">
            {company?.name ?? "—"}
            {contact ? ` · ${[contact.first_name, contact.last_name].filter(Boolean).join(" ")}` : ""}
          </p>
        </div>
        <span className="rounded-full border border-ink-300 px-3 py-1 text-sm">
          {proposalStateLabel(state)}
        </span>
      </header>

      {board?.signature_mismatch ? (
        // Should be impossible — the freeze trigger prevents it. Shown loudly
        // precisely because its appearing at all would mean something is wrong.
        <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4">
          <p className="font-semibold text-red-900">
            This signature does not match the current document.
          </p>
          <p className="mt-1 text-sm text-red-800">
            The signed record and the proposal have diverged, which should not be possible.
            Do not rely on this signature. Please report it.
          </p>
        </div>
      ) : null}

      {signature ? (
        <section className="rounded-lg border border-emerald-300 bg-emerald-50 p-6">
          <h2 className="text-lg font-semibold text-emerald-900">Signed</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-emerald-800">Signed by</dt>
              <dd className="font-medium text-emerald-950">
                {signature.typed_name as string}
                {signature.signer_title ? `, ${signature.signer_title as string}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-emerald-800">Email given</dt>
              <dd className="text-emerald-950">{(signature.signer_email as string) ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-emerald-800">When</dt>
              <dd className="text-emerald-950">{stamp(signature.signed_at as string)}</dd>
            </div>
            <div>
              <dt className="text-emerald-800">From</dt>
              <dd className="text-emerald-950">{(signature.ip_address as string) ?? "—"}</dd>
            </div>
          </dl>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-emerald-900 underline">
              What they agreed to, exactly as shown
            </summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-white p-3 text-xs text-ink-700">
              {signature.consent_text as string}
            </pre>
            <p className="mt-2 break-all text-xs text-emerald-800">
              Document reference {signature.document_hash as string}
            </p>
          </details>

          {proposal.opportunity_id ? (
            <div className="mt-4 border-t border-emerald-200 pt-4">
              {board?.job_id ? (
                <p className="text-sm text-emerald-900">
                  Job{" "}
                  <Link href={`/admin/jobs/${board.job_id}`} className="font-medium underline">
                    {board.job_number as string}
                  </Link>{" "}
                  is open for this work.
                </p>
              ) : (
                <p className="text-sm text-emerald-900">
                  No job yet.{" "}
                  <Link
                    href={`/admin/proposals/${proposal.opportunity_id}`}
                    className="font-medium underline"
                  >
                    Open the request to create one.
                  </Link>
                </p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {proposal.status === "declined" ? (
        <div className="rounded-lg border border-ink-300 bg-white p-4 text-sm">
          <p className="font-semibold text-ink-900">
            Declined {stamp(proposal.declined_at as string)}
          </p>
          {proposal.decline_reason ? (
            <p className="mt-1 text-ink-700">
              Reason given: {proposal.decline_reason as string}
            </p>
          ) : null}
        </div>
      ) : null}

      <ProposalEditor
        proposal={{
          id: proposal.id as string,
          proposal_number: proposal.proposal_number as string,
          status: proposal.status as string,
          title: proposal.title as string,
          scope: (proposal.scope as string) ?? null,
          exclusions: (proposal.exclusions as string) ?? null,
          terms: (proposal.terms as string) ?? null,
          notes: (proposal.notes as string) ?? null,
          valid_until: (proposal.valid_until as string) ?? null,
          tax_rate: String(proposal.tax_rate),
          subtotal: String(proposal.subtotal),
          tax_amount: String(proposal.tax_amount),
          total: String(proposal.total),
          currency: proposal.currency as string,
          content_hash: (proposal.content_hash as string) ?? null,
          document_filename: document?.original_filename ?? null,
        }}
        lines={(lines ?? []).map((l) => ({
          id: l.id as string,
          description: l.description as string,
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
          amount: String(l.amount),
        }))}
        links={(links ?? []).map((l) => ({
          id: l.id as string,
          sent_to: (l.sent_to as string) ?? null,
          created_at: l.created_at as string,
          expires_at: (l.expires_at as string) ?? null,
          revoked_at: (l.revoked_at as string) ?? null,
          first_viewed_at: (l.first_viewed_at as string) ?? null,
          last_viewed_at: (l.last_viewed_at as string) ?? null,
          view_count: Number(l.view_count ?? 0),
        }))}
        defaultEmail={contact?.email ?? null}
      />

      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">Audit trail</h2>
        <p className="mt-1 text-sm text-ink-600">
          Append-only. Nobody signed in — owners included — can edit or delete these
          entries; that is what makes them worth having.
        </p>
        <ol className="mt-4 space-y-2 text-sm">
          {(events ?? []).map((e) => (
            <li key={e.id as string} className="flex flex-wrap gap-x-3 border-b border-ink-100 pb-2">
              <span className="text-ink-500">{stamp(e.occurred_at as string)}</span>
              <span className="font-medium text-ink-900">
                {eventLabels[e.kind as string] ?? (e.kind as string)}
              </span>
              {e.detail ? <span className="text-ink-600">{e.detail as string}</span> : null}
              {e.ip_address ? (
                <span className="text-ink-400">{e.ip_address as string}</span>
              ) : null}
            </li>
          ))}
          {(events ?? []).length === 0 ? (
            <li className="text-ink-500">Nothing recorded yet.</li>
          ) : null}
        </ol>
      </section>
    </div>
  );
}
