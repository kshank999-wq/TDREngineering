import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { invoiceStates, invoiceStateLabel, invoiceStateTone, owingStates, money } from "@/content/billing";
import { statusClasses } from "@/content/statuses";
import { markExported } from "./[id]/actions";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; state?: string; page?: string }>;
const PAGE_SIZE = 40;

/**
 * The billing ledger. Defaults to what is still owed, because that is the
 * question this page exists to answer — paid invoices are history.
 */
export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const state = params.state ?? "owing";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await supabaseServer();
  let request = supabase
    .from("v_invoice_ledger")
    .select("*", { count: "exact" })
    .order("issue_date", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (state === "owing") request = request.in("state", owingStates);
  else if (state !== "all") request = request.eq("state", state);
  if (query) request = request.ilike("search_text", `%${query}%`);

  const { data, count, error } = await request;
  const rows = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Totals for the whole filter, not just this page — a page-only figure would
  // quietly understate what is owed.
  const { data: owingAll } = await supabase
    .from("v_invoice_ledger")
    .select("balance, state, days_past_due")
    .in("state", owingStates);

  const outstanding = (owingAll ?? []).reduce((s, r) => s + Number(r.balance ?? 0), 0);
  const overdue = (owingAll ?? [])
    .filter((r) => r.state === "overdue")
    .reduce((s, r) => s + Number(r.balance ?? 0), 0);

  // What accounting has not been given yet. Drafts are excluded: a draft is
  // not a document anyone should be posting to the books.
  const [{ count: pendingInvoices }, { count: pendingPayments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .is("exported_at", null)
      .is("archived_at", null)
      .neq("status", "draft"),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .is("exported_at", null)
      .is("archived_at", null),
  ]);

  const qs = (over: Record<string, string>) =>
    new URLSearchParams({ q: query, state, ...over }).toString();

  return (
    <div className="container-tdr py-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Invoices</h1>
          <p className="mt-1 text-sm text-ink-600">
            What has been billed, and what is still owed.
          </p>
        </div>
        <div className="flex gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Outstanding
            </p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-ink-900">
              {money(outstanding)}
            </p>
          </div>
          {overdue > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Overdue</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-red-700">
                {money(overdue)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-ink-200 bg-white p-5">
        <div className="min-w-64 flex-1">
          <label htmlFor="q" className="block text-sm font-medium text-ink-800">Search</label>
          <input id="q" name="q" type="search" defaultValue={query}
            placeholder="Invoice number, job, client, PO…"
            className="mt-1.5 w-full rounded-md border border-ink-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
        </div>
        <div>
          <label htmlFor="state" className="block text-sm font-medium text-ink-800">Show</label>
          <select id="state" name="state" defaultValue={state}
            className="mt-1.5 rounded-md border border-ink-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none">
            <option value="owing">Still owed</option>
            <option value="all">All invoices</option>
            {invoiceStates.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500">
          Apply
        </button>
      </form>

      {error ? (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load invoices: {error.message}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-ink-500">{count ?? 0} {count === 1 ? "invoice" : "invoices"}</p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[58rem] text-left text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Invoice</th>
              <th className="px-5 py-3 font-semibold">Client</th>
              <th className="px-5 py-3 font-semibold">Due</th>
              <th className="px-5 py-3 font-semibold">State</th>
              <th className="px-5 py-3 text-right font-semibold">Total</th>
              <th className="px-5 py-3 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-ink-500">
                  {state === "owing" ? "Nothing outstanding. Everything billed has been paid." : "No invoices match this view."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id as string} className="hover:bg-ink-50">
                  <td className="px-5 py-4">
                    <Link href={`/admin/invoices/${row.id}`} className="font-mono text-xs font-semibold text-brand-600 hover:text-brand-500">
                      {row.invoice_number as string}
                    </Link>
                    {row.job_number ? (
                      <span className="block text-xs text-ink-500">{row.job_number as string} · {row.job_name as string}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-ink-600">
                    {row.company_name ? <span className="block">{row.company_name as string}</span> : null}
                    {row.contact_name ? <span className="block text-xs text-ink-500">{row.contact_name as string}</span> : null}
                    {!row.company_name && !row.contact_name ? "—" : null}
                  </td>
                  <td className="px-5 py-4 text-ink-600">
                    {row.due_date ? new Date(`${row.due_date}T00:00:00`).toLocaleDateString() : "—"}
                    {row.state === "overdue" && row.days_past_due ? (
                      <span className="block text-xs font-medium text-red-700">
                        {row.days_past_due as number} days late
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClasses[invoiceStateTone(row.state as string)]}`}>
                      {invoiceStateLabel(row.state as string)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums text-ink-600">{money(row.total)}</td>
                  <td className="px-5 py-4 text-right font-mono font-semibold tabular-nums text-ink-900">
                    {Number(row.balance) > 0 ? money(row.balance) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="mt-10 rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
          Export to accounting
        </h2>
        <p className="mt-2 max-w-prose text-sm text-ink-600">
          Hands invoices and payments to QuickBooks. Records flow out only — this system
          keeps the numbering and nothing comes back.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {([
            ["invoices", "Invoices", pendingInvoices ?? 0, "One row per line item, in QuickBooks' import shape. Drafts are never included."],
            ["payments", "Payments", pendingPayments ?? 0, "What has been received, against the invoice it settles."],
          ] as const).map(([kind, label, pending, hint]) => (
            <div key={kind} className="rounded-lg border border-ink-200 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-900">{label}</h3>
                <span className="font-mono text-sm tabular-nums text-ink-600">
                  {pending} waiting
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-500">{hint}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={`/admin/invoices/export?type=${kind}&pending=true`}
                  className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50"
                >
                  Download waiting
                </a>
                <a
                  href={`/admin/invoices/export?type=${kind}&pending=false`}
                  className="rounded-md px-2 py-1.5 text-xs font-medium text-ink-500 hover:text-ink-800"
                >
                  Download everything
                </a>
                {pending > 0 ? (
                  <form action={markExported} className="ml-auto">
                    <input type="hidden" name="kind" value={kind} />
                    <button
                      type="submit"
                      className="rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50"
                    >
                      Mark {pending} exported
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-ink-500">
          Download first, import into QuickBooks, and only mark them exported once the import
          is accepted. Marking is separate on purpose — nothing is stamped just because a file
          was downloaded.
        </p>
      </section>

      {pages > 1 ? (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          {page > 1 ? (
            <Link href={`/admin/invoices?${qs({ page: String(page - 1) })}`} className="text-sm font-semibold text-brand-600">← Previous</Link>
          ) : <span />}
          <span className="text-sm text-ink-500">Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={`/admin/invoices?${qs({ page: String(page + 1) })}`} className="text-sm font-semibold text-brand-600">Next →</Link>
          ) : <span />}
        </nav>
      ) : null}
    </div>
  );
}
