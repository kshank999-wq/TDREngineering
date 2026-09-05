import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; kind?: string; page?: string }>;

const PAGE_SIZE = 30;

/**
 * Client directory — people and firms in one list, from `v_client_directory`.
 *
 * Contacts and companies live in separate tables because they are different
 * things (spec §8), but whoever is looking for "Dans Arch" does not care which
 * table it is in. The view unions them so one search finds either.
 */
export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const kind = params.kind ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await supabaseServer();
  let request = supabase
    .from("v_client_directory")
    .select("*", { count: "exact" })
    .order("name")
    .range(from, from + PAGE_SIZE - 1);

  if (kind) request = request.eq("kind", kind);
  if (query) request = request.ilike("search_text", `%${query}%`);

  const { data: rows, count, error } = await request;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // Surfaced here rather than in the nav: duplicates are worth acting on when
  // you are already looking at the list, not as a permanent badge.
  const { count: duplicateCountRaw } = await supabase
    .from("v_duplicate_clients")
    .select("a_id", { count: "exact", head: true });
  const duplicateCount = duplicateCountRaw ?? 0;

  return (
    <div className="container-tdr py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Clients</h1>
          <p className="mt-1 text-sm text-ink-600">
            Everyone in the database — clients and referring professionals alike.
          </p>
        </div>
        {duplicateCount > 0 ? (
          <Link
            href="/admin/clients/duplicates"
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"} — review
          </Link>
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
            placeholder="Name, company, email, phone, address…"
            className="mt-1.5 w-full rounded-md border border-ink-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="kind" className="block text-sm font-medium text-ink-800">
            Type
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue={kind}
            className="mt-1.5 rounded-md border border-ink-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          >
            <option value="">Everyone</option>
            <option value="contact">People</option>
            <option value="company">Companies</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500"
        >
          Apply
        </button>
        {query || kind ? (
          <Link href="/admin/clients" className="px-2 py-2.5 text-sm text-ink-500 hover:text-ink-800">
            Clear
          </Link>
        ) : null}
      </form>

      {error ? (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load clients: {error.message}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-ink-500">
        {count ?? 0} {count === 1 ? "record" : "records"}
        {query ? ` matching “${query}”` : ""}
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Type</th>
              <th className="px-5 py-3 font-semibold">Contact</th>
              <th className="px-5 py-3 font-semibold">Mailing address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-ink-500">
                  No clients match this view.
                </td>
              </tr>
            ) : (
              (rows ?? []).map((row) => (
                <tr key={`${row.kind}-${row.id}`} className="hover:bg-ink-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/clients/${row.kind}/${row.id}`}
                      className="font-semibold text-brand-600 hover:text-brand-500"
                    >
                      {row.name as string}
                    </Link>
                    {row.company_name ? (
                      <span className="block text-xs text-ink-500">{row.company_name as string}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600">
                      {row.kind === "company"
                        ? "Company"
                        : row.is_professional
                          ? "Professional"
                          : "Client"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-ink-600">
                    {row.email ? <span className="block">{row.email as string}</span> : null}
                    {row.phone ? (
                      <span className="block text-xs text-ink-500">{row.phone as string}</span>
                    ) : null}
                    {!row.email && !row.phone ? "—" : null}
                  </td>
                  <td className="px-5 py-4">
                    {row.has_mailing_address ? (
                      <span className="text-emerald-700">On file</span>
                    ) : (
                      <span className="text-ink-400">Not set</span>
                    )}
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
              href={`/admin/clients?${new URLSearchParams({ q: query, kind, page: String(page - 1) })}`}
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
              href={`/admin/clients?${new URLSearchParams({ q: query, kind, page: String(page + 1) })}`}
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
