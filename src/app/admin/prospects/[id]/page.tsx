import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { ProspectImportPanel } from "@/components/admin/prospect-import-panel";
import { ProspectListPanel } from "@/components/admin/prospect-list-panel";
import { unsubscribeConfigured } from "@/lib/marketing/unsubscribe";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function ProspectListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string; show?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff) notFound();

  const { id } = await params;
  const { q, page, show } = await searchParams;
  const pageNumber = Math.max(1, Number(page ?? "1") || 1);
  const from = (pageNumber - 1) * PAGE_SIZE;

  const supabase = await supabaseServer();

  const { data: list } = await supabase
    .from("v_marketing_lists")
    .select(
      "id, name, description, purpose, member_count, sendable_count, suppressed_count, no_email_count, archived_at, last_import_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!list) notFound();

  let query = supabase
    .from("v_marketing_list_members")
    .select(
      "contact_id, full_name, email, company_name, title, sendable, suppression_reason, contact_archived, source, added_at",
      { count: "exact" },
    )
    .eq("list_id", id)
    .order("full_name")
    .range(from, from + PAGE_SIZE - 1);

  if (show === "blocked") query = query.eq("sendable", false);
  else if (show === "mailable") query = query.eq("sendable", true);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`);

  const [{ data: members, count }, { data: imports }] = await Promise.all([
    query,
    supabase
      .from("marketing_imports")
      .select("id, filename, rows_total, rows_added, rows_matched, rows_skipped, rows_suppressed, imported_at")
      .eq("list_id", id)
      .order("imported_at", { ascending: false })
      .limit(10),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink-500">
          <Link href="/admin/prospects" className="underline">
            Prospects
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">{list.name as string}</h1>
        {list.purpose ? (
          <p className="mt-1 text-sm text-ink-600">{list.purpose as string}</p>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Mailable" value={Number(list.sendable_count ?? 0)} strong />
        <Stat label="On the list" value={Number(list.member_count ?? 0)} />
        <Stat label="Opted out" value={Number(list.suppressed_count ?? 0)} />
        <Stat label="No address" value={Number(list.no_email_count ?? 0)} />
      </div>

      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">Export</h2>
        <p className="mt-1 text-sm text-ink-600">
          The mailable export contains only people who can legally be emailed — anyone on the
          do-not-email list is excluded by the database, not by this screen.
        </p>
        {!unsubscribeConfigured() ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No unsubscribe column: <code>MARKETING_UNSUBSCRIBE_SECRET</code> is not set.
            Marketing email must carry a working opt-out link.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={`/admin/prospects/${id}/export`}
            className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Download mailable ({Number(list.sendable_count ?? 0)})
          </a>
          <a
            href={`/admin/prospects/${id}/export?all=1`}
            className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800"
          >
            Download everyone, including opt-outs
          </a>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          The second file is for reconciling against your mail provider. Do not send to it.
        </p>
      </section>

      <ProspectImportPanel listId={id} />

      <ProspectListPanel
        listId={id}
        name={list.name as string}
        description={(list.description as string) ?? null}
        purpose={(list.purpose as string) ?? null}
        archived={Boolean(list.archived_at)}
      />

      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink-900">
            People ({count ?? 0})
          </h2>
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Name, email, company"
              className="rounded-md border border-ink-300 px-3 py-1.5 text-sm"
            />
            <select
              name="show"
              defaultValue={show ?? ""}
              className="rounded-md border border-ink-300 px-3 py-1.5 text-sm"
            >
              <option value="">Everyone</option>
              <option value="mailable">Mailable only</option>
              <option value="blocked">Cannot be mailed</option>
            </select>
            <button className="rounded-md border border-ink-300 px-3 py-1.5 text-sm">
              Filter
            </button>
          </form>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-500">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Company</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.contact_id as string} className="border-b border-ink-100">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/admin/clients/contact/${m.contact_id}`}
                      className="text-ink-900 underline"
                    >
                      {(m.full_name as string) || "—"}
                    </Link>
                    {m.title ? (
                      <span className="block text-xs text-ink-500">{m.title as string}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-ink-600">{(m.email as string) ?? "—"}</td>
                  <td className="py-2 pr-3 text-ink-600">
                    {(m.company_name as string) ?? "—"}
                  </td>
                  <td className="py-2">
                    {m.sendable ? (
                      <span className="text-emerald-700">Mailable</span>
                    ) : m.suppression_reason ? (
                      <span className="text-red-700">
                        {m.suppression_reason === "unsubscribed"
                          ? "Unsubscribed"
                          : m.suppression_reason === "complained"
                            ? "Reported spam"
                            : m.suppression_reason === "bounced"
                              ? "Bounced"
                              : "Do not email"}
                      </span>
                    ) : m.contact_archived ? (
                      <span className="text-ink-500">Archived contact</span>
                    ) : (
                      <span className="text-ink-500">No email address</span>
                    )}
                  </td>
                </tr>
              ))}
              {(members ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-500">
                    Nobody here yet. Import a spreadsheet above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <nav className="mt-4 flex items-center gap-3 text-sm">
            {pageNumber > 1 ? (
              <Link
                href={`/admin/prospects/${id}?page=${pageNumber - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${show ? `&show=${show}` : ""}`}
                className="underline"
              >
                ← Previous
              </Link>
            ) : null}
            <span className="text-ink-500">
              Page {pageNumber} of {totalPages}
            </span>
            {pageNumber < totalPages ? (
              <Link
                href={`/admin/prospects/${id}?page=${pageNumber + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${show ? `&show=${show}` : ""}`}
                className="underline"
              >
                Next →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      {(imports ?? []).length > 0 ? (
        <section className="rounded-lg border border-ink-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-ink-900">Import history</h2>
          <p className="mt-1 text-sm text-ink-600">
            Kept so &ldquo;where did this person come from&rdquo; has an answer a year later.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-500">
                <th className="py-2 font-medium">When</th>
                <th className="py-2 font-medium">File</th>
                <th className="py-2 text-right font-medium">New</th>
                <th className="py-2 text-right font-medium">Matched</th>
                <th className="py-2 text-right font-medium">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {(imports ?? []).map((imp) => (
                <tr key={imp.id as string} className="border-b border-ink-100">
                  <td className="py-2 pr-3 text-ink-600">
                    {new Date(imp.imported_at as string).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3">{(imp.filename as string) ?? "—"}</td>
                  <td className="py-2 text-right">{Number(imp.rows_added ?? 0)}</td>
                  <td className="py-2 text-right">{Number(imp.rows_matched ?? 0)}</td>
                  <td className="py-2 text-right">{Number(imp.rows_skipped ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${strong ? "text-emerald-700" : "text-ink-900"}`}
      >
        {value}
      </p>
    </div>
  );
}
