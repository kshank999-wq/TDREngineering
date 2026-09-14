import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { unsubscribeConfigured } from "@/lib/marketing/unsubscribe";
import { createProspectList } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProspectListsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff) notFound();

  const { show } = await searchParams;
  const supabase = await supabaseServer();

  let query = supabase
    .from("v_marketing_lists")
    .select(
      "id, name, description, purpose, member_count, sendable_count, suppressed_count, no_email_count, last_import_at, archived_at, updated_at",
    )
    .order("updated_at", { ascending: false });

  if (show === "archived") query = query.not("archived_at", "is", null);
  else query = query.is("archived_at", null);

  const [{ data: lists }, { count: suppressedTotal }] = await Promise.all([
    query,
    supabase.from("email_suppressions").select("email", { count: "exact", head: true }),
  ]);

  const rows = lists ?? [];
  const linksReady = unsubscribeConfigured();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Prospects</h1>
          <p className="mt-1 text-sm text-ink-600">
            Lists of people to market to. A list is a grouping of contacts — the same records
            used everywhere else, not a separate address book.
          </p>
        </div>
        <Link href="/admin/prospects/suppressions" className="text-sm underline text-ink-700">
          Do-not-email list ({suppressedTotal ?? 0})
        </Link>
      </header>

      {!linksReady ? (
        // Loud rather than silent: exporting a list that cannot carry a working
        // opt-out link is the one thing that must not happen quietly.
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Unsubscribe links are not configured.</p>
          <p className="mt-1">
            Exports will not include an unsubscribe column until{" "}
            <code>MARKETING_UNSUBSCRIBE_SECRET</code> is set. Marketing email has to carry a
            working opt-out link, so set it before sending anything.
          </p>
        </div>
      ) : null}

      <form className="flex gap-2">
        <select
          name="show"
          defaultValue={show ?? ""}
          className="rounded-md border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="">Current lists</option>
          <option value="archived">Archived</option>
        </select>
        <button className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium">
          Show
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((l) => (
          <Link
            key={l.id as string}
            href={`/admin/prospects/${l.id}`}
            className="rounded-lg border border-ink-200 bg-white p-4 hover:border-ink-400"
          >
            <h2 className="font-semibold text-ink-900">{l.name as string}</h2>
            {l.purpose ? (
              <p className="mt-1 text-xs text-ink-500">{l.purpose as string}</p>
            ) : null}
            {l.description ? (
              <p className="mt-2 line-clamp-2 text-sm text-ink-600">
                {l.description as string}
              </p>
            ) : null}

            <p className="mt-3 text-2xl font-bold text-ink-900">
              {Number(l.sendable_count ?? 0)}
              <span className="ml-1 text-sm font-normal text-ink-500">mailable</span>
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {Number(l.member_count ?? 0)} on the list
              {Number(l.suppressed_count ?? 0) > 0
                ? ` · ${l.suppressed_count} opted out`
                : ""}
              {Number(l.no_email_count ?? 0) > 0 ? ` · ${l.no_email_count} no address` : ""}
            </p>
          </Link>
        ))}
        {rows.length === 0 ? (
          <p className="col-span-full rounded-lg border border-dashed border-ink-300 p-8 text-center text-ink-500">
            No lists yet.
          </p>
        ) : null}
      </div>

      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">New list</h2>
        <form action={createProspectList} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">Name</span>
              <input
                name="name"
                required
                placeholder="Architects 2026"
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">What it is for</span>
              <input
                name="purpose"
                placeholder="Quarterly capability mailer"
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Description</span>
            <textarea
              name="description"
              rows={2}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
            />
          </label>
          <button className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white">
            Create
          </button>
        </form>
      </section>
    </div>
  );
}
