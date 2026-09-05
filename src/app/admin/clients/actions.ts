"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";

/**
 * Merging duplicate client records.
 *
 * IMPORTANT — this file carries the `"use server"` directive, so it may export
 * ONLY async functions. Exporting a constant here takes the whole route down
 * at runtime, and neither the build nor the typechecker will tell you.
 * `npm run check:actions` is what catches it.
 *
 * The merge itself is a single database function (see 0004_merge.sql) rather
 * than a sequence of updates from here. A merge that moved four of five
 * references and then failed would leave the data worse than the duplicate it
 * was fixing; inside one function it is one transaction, all or nothing.
 *
 * Like buying a shipping label, this is quote-then-commit: `impactOf` shows
 * what is about to move, and only then does `mergeClients` move it.
 */

export type Impact = {
  opportunities: number;
  referrals: number;
  shipments: number;
  inquiries: number;
  people: number;
};

export type MergeResult = { ok: true; moved: Impact } | { ok: false; error: string };

export type ClientHit = { id: string; name: string; detail: string };

const isKind = (value: string): value is "contact" | "company" =>
  value === "contact" || value === "company";

/** What is attached to a record — shown before anything is merged. */
export async function impactOf(kind: string, id: string): Promise<Impact | null> {
  const staff = await getStaffUser();
  if (!staff || !isKind(kind) || !id) return null;

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("client_impact", { p_kind: kind, p_id: id });
  if (error || !data) return null;
  return data as Impact;
}

/**
 * Merges `loserId` into `winnerId`. The winner survives and keeps its own
 * values; the loser is archived, never deleted, with `merged_into_id` pointing
 * at where it went.
 */
export async function mergeClients(input: {
  kind: string;
  winnerId: string;
  loserId: string;
}): Promise<MergeResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized. Sign in again." };
  if (!isKind(input.kind)) return { ok: false, error: "Unknown client type." };
  if (!input.winnerId || !input.loserId) return { ok: false, error: "Two records are required." };
  if (input.winnerId === input.loserId) {
    return { ok: false, error: "A record cannot be merged into itself." };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc(
    input.kind === "contact" ? "merge_contacts" : "merge_companies",
    { p_winner: input.winnerId, p_loser: input.loserId },
  );

  if (error) {
    // The database raises the reasons a merge is refused (already archived, no
    // longer exists, not staff). Those messages are written for a person.
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/clients");
  revalidatePath("/admin/clients/duplicates");
  revalidatePath(`/admin/clients/${input.kind}/${input.winnerId}`);
  revalidatePath(`/admin/clients/${input.kind}/${input.loserId}`);

  return { ok: true, moved: data as Impact };
}

/**
 * Finds records of the same kind to merge in, for the case the duplicate
 * detector misses — two records for the same firm under unrelated names, which
 * no amount of string similarity will pair up.
 */
export async function findMergeCandidates(input: {
  kind: string;
  excludeId: string;
  query: string;
}): Promise<ClientHit[]> {
  const staff = await getStaffUser();
  if (!staff || !isKind(input.kind)) return [];

  const query = input.query.trim();
  if (query.length < 2) return [];

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("v_client_directory")
    .select("id, name, email, phone, company_name")
    .eq("kind", input.kind)
    .neq("id", input.excludeId)
    .ilike("search_text", `%${query}%`)
    .order("name")
    .limit(10);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? "",
    detail: [row.company_name, row.email, row.phone].filter(Boolean).join(" · "),
  }));
}
