import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { money } from "@/content/billing";
import { proposalStates, proposalStateLabel } from "@/content/esign";

export const dynamic = "force-dynamic";

/**
 * Proposal documents — what TDR has offered, and where each one stands.
 *
 * Distinct from /admin/proposals, which lists proposal REQUESTS: what clients
 * have asked for. A request is their document; a proposal is TDR's.
 */

const tone: Record<string, string> = {
  draft: "bg-ink-100 text-ink-700",
  awaiting_signature: "bg-blue-100 text-blue-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-ink-100 text-ink-600",
  expired: "bg-amber-100 text-amber-800",
  withdrawn: "bg-ink-100 text-ink-600",
};

export default async function ProposalDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; q?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff) notFound();

  const { state, q } = await searchParams;
  const supabase = await supabaseServer();

  let query = supabase
    .from("v_proposal_board")
    .select(
      "id, proposal_number, title, company_name, contact_name, state, total, currency, valid_until, sent_at, signed_by, signed_at, last_viewed_at, live_links, signature_mismatch",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (state) query = query.eq("state", state);
  if (q) query = query.ilike("search_text", `%${q}%`);

  const { data: rows } = await query;

  const outstanding = (rows ?? []).filter((r) => r.state === "awaiting_signature");
  const outstandingValue = outstanding.reduce((sum, r) => sum + Number(r.total ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Proposals</h1>
          <p className="mt-1 text-sm text-ink-600">
            What TDR has offered. Create one from a proposal request.
          </p>
        </div>
        <p className="text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{outstanding.length}</span> awaiting
          signature ·{" "}
          <span className="font-semibold text-ink-900">{money(outstandingValue)}</span>
        </p>
      </header>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Number, title, client, address"
          className="min-w-64 flex-1 rounded-md border border-ink-300 px-3 py-2 text-sm"
        />
        <select
          name="state"
          defaultValue={state ?? ""}
          className="rounded-md border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="">All states</option>
          {proposalStates.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th className="p-3 font-medium">Number</th>
              <th className="p-3 font-medium">Proposal</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 text-right font-medium">Total</th>
              <th className="p-3 font-medium">State</th>
              <th className="p-3 font-medium">Last opened</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id as string} className="border-b border-ink-100 hover:bg-ink-50">
                <td className="p-3 whitespace-nowrap">
                  <Link
                    href={`/admin/proposals/documents/${r.id}`}
                    className="font-medium text-ink-900 underline"
                  >
                    {r.proposal_number as string}
                  </Link>
                </td>
                <td className="p-3">{r.title as string}</td>
                <td className="p-3 text-ink-600">
                  {(r.company_name as string) ?? (r.contact_name as string) ?? "—"}
                </td>
                <td className="p-3 text-right">
                  {money(r.total, (r.currency as string) ?? "USD")}
                </td>
                <td className="p-3 whitespace-nowrap">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${tone[r.state as string] ?? "bg-ink-100"}`}
                  >
                    {proposalStateLabel(r.state as string)}
                  </span>
                  {r.signature_mismatch ? (
                    <span className="ml-2 text-xs font-semibold text-red-700">
                      hash mismatch
                    </span>
                  ) : null}
                  {r.signed_by ? (
                    <span className="ml-2 text-xs text-ink-500">{r.signed_by as string}</span>
                  ) : null}
                </td>
                <td className="p-3 text-ink-500">
                  {r.last_viewed_at
                    ? new Date(r.last_viewed_at as string).toLocaleDateString()
                    : "Not opened"}
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ink-500">
                  No proposals yet. Open a proposal request and create one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
