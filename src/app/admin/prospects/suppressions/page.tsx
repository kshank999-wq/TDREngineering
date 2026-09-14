import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { SuppressionPanel } from "@/components/admin/suppression-panel";

export const dynamic = "force-dynamic";

/**
 * The do-not-email list.
 *
 * Deliberately its own screen rather than a tab on a list: it is not a
 * property of any one list. It applies everywhere, which is the entire point.
 */
export default async function SuppressionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; reason?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff) notFound();

  const { q, reason } = await searchParams;
  const supabase = await supabaseServer();

  let query = supabase
    .from("v_email_suppressions")
    .select("email, reason, source, notes, suppressed_at, contact_name, company_name, permanent")
    .order("suppressed_at", { ascending: false })
    .limit(500);

  if (reason) query = query.eq("reason", reason);
  if (q) query = query.ilike("email", `%${q}%`);

  const { data: rows } = await query;
  const suppressions = rows ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink-500">
          <Link href="/admin/prospects" className="underline">
            Prospects
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">Do-not-email list</h1>
        <p className="mt-1 text-sm text-ink-600">
          Everyone who must not receive marketing email. This applies across every list — adding
          somebody to a new list does not override it.
        </p>
      </header>

      <div className="rounded-lg border border-ink-300 bg-ink-50 p-4 text-sm text-ink-700">
        <p className="font-semibold text-ink-900">Unsubscribes cannot be undone.</p>
        <p className="mt-1">
          A bounce or a manual entry can be lifted. Somebody who unsubscribed or reported spam
          cannot be put back by anyone, at any access level — the database refuses it. They
          have to opt in again themselves.
        </p>
      </div>

      <SuppressionPanel />

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by address"
          className="min-w-64 flex-1 rounded-md border border-ink-300 px-3 py-2 text-sm"
        />
        <select
          name="reason"
          defaultValue={reason ?? ""}
          className="rounded-md border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="">All reasons</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="complained">Reported spam</option>
          <option value="bounced">Bounced</option>
          <option value="manual">Added by staff</option>
        </select>
        <button className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium">
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th className="p-3 font-medium">Address</th>
              <th className="p-3 font-medium">Who</th>
              <th className="p-3 font-medium">Reason</th>
              <th className="p-3 font-medium">Since</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {suppressions.map((s) => (
              <tr key={s.email as string} className="border-b border-ink-100">
                <td className="p-3">{s.email as string}</td>
                <td className="p-3 text-ink-600">
                  {(s.contact_name as string) || "—"}
                  {s.company_name ? (
                    <span className="block text-xs text-ink-500">
                      {s.company_name as string}
                    </span>
                  ) : null}
                </td>
                <td className="p-3">
                  {s.reason === "unsubscribed" ? (
                    <span className="text-red-700">Unsubscribed</span>
                  ) : s.reason === "complained" ? (
                    <span className="text-red-700">Reported spam</span>
                  ) : s.reason === "bounced" ? (
                    <span className="text-amber-700">Bounced</span>
                  ) : (
                    <span className="text-ink-600">Added by staff</span>
                  )}
                  {s.source ? (
                    <span className="block text-xs text-ink-400">{s.source as string}</span>
                  ) : null}
                </td>
                <td className="p-3 text-ink-500">
                  {new Date(s.suppressed_at as string).toLocaleDateString()}
                </td>
                <td className="p-3 text-right">
                  {s.permanent ? (
                    <span className="text-xs text-ink-400">Permanent</span>
                  ) : (
                    <SuppressionPanel liftEmail={s.email as string} />
                  )}
                </td>
              </tr>
            ))}
            {suppressions.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-ink-500">
                  Nobody on the do-not-email list.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
