import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { opportunityStatuses, statusLabel, statusTone, statusClasses } from "@/content/statuses";
import { SignOutButton } from "@/components/admin/sign-out-button";

export const metadata: Metadata = { title: "Proposal requests" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; status?: string; page?: string }>;

const PAGE_SIZE = 25;

/**
 * Incoming proposal requests (spec §10).
 *
 * Supports the four things the spec asks for at this stage: view, search,
 * filter by status, and drill into a request. Everything reads through the
 * RLS-scoped session client, so a signed-in user with no staff role sees
 * nothing even if they reach this URL.
 */
export default async function ProposalsPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await supabaseServer();

  let request = supabase
    .from("v_opportunity_search")
    .select("*", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (status) request = request.eq("status", status);
  if (query) request = request.ilike("search_text", `%${query}%`);

  const { data: rows, count, error } = await request;

  return (
    <div className="container-tdr py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Proposal requests</h1>
          <p className="mt-1 text-sm text-ink-600">
            Signed in as {staff.fullName || staff.email} ({staff.role.replace(/_/g, " ")})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/proposals/export?${new URLSearchParams({ q: query, status }).toString()}`}
            className="rounded-md border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"
          >
            Export CSV
          </Link>
          <SignOutButton />
        </div>
      </div>

      {/* Search + status filter. A GET form keeps the state in the URL, so a
          filtered view can be bookmarked or shared. */}
      <form method="get" className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-ink-200 bg-white p-5">
        <div className="min-w-64 flex-1">
          <label htmlFor="q" className="block text-sm font-medium text-ink-800">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Name, company, email, phone, address, APN, referral, proposal number…"
            className="mt-1.5 w-full rounded-md border border-ink-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-ink-800">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="mt-1.5 rounded-md border border-ink-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          >
            <option value="">All statuses</option>
            {opportunityStatuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500"
        >
          Apply
        </button>
        {query || status ? (
          <Link href="/admin/proposals" className="px-2 py-2.5 text-sm text-ink-500 hover:text-ink-800">
            Clear
          </Link>
        ) : null}
      </form>

      {error ? (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load proposal requests: {error.message}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-ink-500">
        {count ?? 0} {count === 1 ? "request" : "requests"}
        {status ? ` · ${statusLabel(status)}` : ""}
        {query ? ` · matching “${query}”` : ""}
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Reference</th>
              <th className="px-5 py-3 font-semibold">Received</th>
              <th className="px-5 py-3 font-semibold">Client</th>
              <th className="px-5 py-3 font-semibold">Property</th>
              <th className="px-5 py-3 font-semibold">Referral</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-ink-500">
                  No proposal requests match this view.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((row) => (
                <tr key={row.id as string} className="hover:bg-ink-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/proposals/${row.id}`}
                      className="font-semibold text-brand-600 hover:text-brand-500"
                    >
                      {row.opportunity_number as string}
                    </Link>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-ink-600">
                    {new Date(row.submitted_at as string).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-medium text-ink-900">
                      {[row.contact_first_name, row.contact_last_name].filter(Boolean).join(" ") || "—"}
                    </span>
                    {row.company_name ? (
                      <span className="block text-xs text-ink-500">{row.company_name as string}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-ink-600">
                    {(row.property_address as string) || "—"}
                    {row.property_city ? (
                      <span className="block text-xs text-ink-500">{row.property_city as string}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-ink-600">
                    {(row.referral_raw_name as string) ||
                      [row.referral_first_name, row.referral_last_name].filter(Boolean).join(" ") ||
                      "—"}
                    {row.referral_company_name || row.referral_raw_company ? (
                      <span className="block text-xs text-ink-500">
                        {(row.referral_company_name as string) || (row.referral_raw_company as string)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                        statusClasses[statusTone(row.status as string)]
                      }`}
                    >
                      {statusLabel(row.status as string)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={count ?? 0} query={query} status={status} />
    </div>
  );
}

function Pagination({
  page,
  total,
  query,
  status,
}: {
  page: number;
  total: number;
  query: string;
  status: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;

  const href = (target: number) =>
    `/admin/proposals?${new URLSearchParams({
      q: query,
      status,
      page: String(target),
    }).toString()}`;

  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className="text-sm font-semibold text-brand-600">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-ink-500">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="text-sm font-semibold text-brand-600">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
