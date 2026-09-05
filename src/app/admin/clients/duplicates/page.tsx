import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { DuplicateCard } from "@/components/admin/duplicate-card";

export const metadata: Metadata = { title: "Possible duplicates" };
export const dynamic = "force-dynamic";

/**
 * Candidate duplicate pairs (see 0004_merge.sql).
 *
 * These come from string matching, so they are suggestions, not findings. Two
 * people at one firm can share a phone number, and a father and son can share
 * a name. Nothing here merges on its own.
 */
export default async function DuplicatesPage() {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");

  const supabase = await supabaseServer();
  const { data: pairs, error } = await supabase
    .from("v_duplicate_clients")
    .select("*")
    .order("score", { ascending: false })
    .order("a_name")
    .limit(100);

  const rows = pairs ?? [];

  return (
    <div className="container-tdr py-10">
      <Link href="/admin/clients" className="text-sm font-semibold text-brand-600">
        ← All clients
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-ink-900">Possible duplicates</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-600">
        The proposal form creates a record from whatever a visitor types, so the same architect can
        arrive twice under two spellings. These pairs share an email address, a phone number or a
        name — check each one before merging.
      </p>

      {error ? (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load duplicates: {error.message}. If this mentions{" "}
          <code className="rounded bg-red-100 px-1 py-0.5 text-xs">v_duplicate_clients</code>, apply{" "}
          <code className="rounded bg-red-100 px-1 py-0.5 text-xs">
            supabase/migrations/0004_merge.sql
          </code>{" "}
          in the Supabase SQL editor.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-lg border border-ink-200 bg-white p-8 text-center text-sm text-ink-500">
          No possible duplicates found. Records that only a person could tell apart can still be
          merged from either client&rsquo;s page.
        </p>
      ) : (
        <>
          <p className="mt-8 text-sm text-ink-500">
            {rows.length} possible {rows.length === 1 ? "duplicate" : "duplicates"}
          </p>
          <ul className="mt-4 space-y-4">
            {rows.map((row) => (
              <DuplicateCard
                key={`${row.kind}-${row.a_id}-${row.b_id}`}
                kind={row.kind as string}
                reason={row.reason as string}
                a={{
                  id: row.a_id as string,
                  name: (row.a_name as string) || "(no name)",
                  detail: (row.a_detail as string) || "",
                  createdAt: row.a_created_at as string,
                }}
                b={{
                  id: row.b_id as string,
                  name: (row.b_name as string) || "(no name)",
                  detail: (row.b_detail as string) || "",
                  createdAt: row.b_created_at as string,
                }}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
