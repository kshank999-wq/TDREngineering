import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { jobStatuses, jobStatusLabel, jobStatusTone, openJobStatuses } from "@/content/job-statuses";
import { statusClasses } from "@/content/statuses";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; status?: string; page?: string }>;

const PAGE_SIZE = 30;

const money = (value: unknown) =>
  value == null
    ? "—"
    : Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" });

/**
 * The job board — everything TDR is currently doing.
 *
 * Defaults to open work rather than everything ever done, because the question
 * this page answers on a Monday morning is "what is live", not "what is in the
 * archive". Completed and cancelled jobs are one filter away.
 */
export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const status = params.status ?? "open";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await supabaseServer();
  let request = supabase
    .from("v_job_board")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (status === "open") request = request.in("status", openJobStatuses);
  else if (status !== "all") request = request.eq("status", status);
  if (query) request = request.ilike("search_text", `%${query}%`);

  const { data: rows, count, error } = await request;
  const jobs = rows ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const openValue = jobs.reduce(
    (sum, row) => sum + (row.contract_amount ? Number(row.contract_amount) : 0),
    0,
  );

  const qs = (over: Record<string, string>) =>
    new URLSearchParams({ q: query, status, ...over }).toString();

  return (
    <div className="container-tdr py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Jobs</h1>
          <p className="mt-1 text-sm text-ink-600">
            Work in progress. A job is created when a proposal is accepted.
          </p>
        </div>
        {jobs.length > 0 ? (
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Contracted, this view
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-ink-900">
              {money(openValue)}
            </p>
          </div>
        ) : null}
      </div>

      <form
        method="get"
        className="mt-8 flex flex-wrap items-end gap-3 rounded-xl border border-ink-200 bg-white p-5"
      >
        <div className="min-w-64 flex-1">
          <label htmlFor="q" className="block text-sm font-medium text-ink-800">
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Job number, client, address, APN, proposal number…"
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
            <option value="open">Open work</option>
            <option value="all">All jobs</option>
            {jobStatuses.map((item) => (
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
      </form>

      {error ? (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load jobs: {error.message}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-ink-500">
        {count ?? 0} {count === 1 ? "job" : "jobs"}
        {status === "open" ? " still open" : ""}
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Job</th>
              <th className="px-5 py-3 font-semibold">Client</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Scheduled</th>
              <th className="px-5 py-3 text-right font-semibold">Contract</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-ink-500">
                  {query || status !== "open"
                    ? "No jobs match this view."
                    : "No open jobs. Accept a proposal request to create one."}
                </td>
              </tr>
            ) : (
              jobs.map((row) => (
                <tr key={row.id as string} className="hover:bg-ink-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/jobs/${row.id}`}
                      className="font-mono text-xs font-semibold text-brand-600 hover:text-brand-500"
                    >
                      {row.job_number as string}
                    </Link>
                    <span className="block text-ink-900">{row.name as string}</span>
                    {row.property_address ? (
                      <span className="block text-xs text-ink-500">
                        {[row.property_address, row.property_city].filter(Boolean).join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-ink-600">
                    {row.contact_name ? (
                      <span className="block">{row.contact_name as string}</span>
                    ) : null}
                    {row.company_name ? (
                      <span className="block text-xs text-ink-500">
                        {row.company_name as string}
                      </span>
                    ) : null}
                    {!row.contact_name && !row.company_name ? "—" : null}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                        statusClasses[jobStatusTone(row.status as string)]
                      }`}
                    >
                      {jobStatusLabel(row.status as string)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-ink-600">
                    {row.scheduled_start
                      ? new Date(`${row.scheduled_start}T00:00:00`).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums text-ink-900">
                    {money(row.contract_amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          {page > 1 ? (
            <Link
              href={`/admin/jobs?${qs({ page: String(page - 1) })}`}
              className="text-sm font-semibold text-brand-600"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-500">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link
              href={`/admin/jobs?${qs({ page: String(page + 1) })}`}
              className="text-sm font-semibold text-brand-600"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
