import { NextResponse } from "next/server";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { toCsv, csvResponse } from "@/lib/csv";
import { unsubscribeUrl, unsubscribeConfigured } from "@/lib/marketing/unsubscribe";

/**
 * Exporting a list, for whatever actually sends the mail.
 *
 * SUPPRESSED PEOPLE ARE NEVER IN THE EXPORT.
 *
 * Not filtered out here — filtered out by the database, in
 * `v_marketing_list_members.sendable`, which is the same column the screen
 * counts. One rule, one place. An export that quietly included opted-out
 * addresses would take TDR's do-not-email list and hand it straight to a
 * mail sender, which is the worst possible outcome of having one.
 *
 * `?all=1` exports everybody including suppressed rows, with the reason in a
 * column. That is for reconciling against a provider, and the filename says
 * so, because a file called "prospects.csv" that contains opt-outs is a
 * loaded gun sitting in somebody's downloads folder.
 *
 * Cells go through `src/lib/csv.ts`, which neutralises leading `=`, `+`, `-`
 * and `@` — these files are opened in Excel, and company names arrive here
 * from spreadsheets somebody else prepared.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getStaffUser();
  if (!staff) return NextResponse.json({ error: "Not authorized." }, { status: 404 });

  const { id } = await params;
  const includeSuppressed = new URL(request.url).searchParams.get("all") === "1";

  const supabase = await supabaseServer();

  const { data: list } = await supabase
    .from("marketing_lists")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!list) return NextResponse.json({ error: "Not found." }, { status: 404 });

  let query = supabase
    .from("v_marketing_list_members")
    .select(
      "full_name, first_name, last_name, email, phone, title, company_name, is_professional, sendable, suppression_reason, added_at, source",
    )
    .eq("list_id", id)
    .order("full_name");

  if (!includeSuppressed) query = query.eq("sendable", true);

  const { data: rows } = await query;
  const members = rows ?? [];

  const withUnsubscribe = unsubscribeConfigured();

  const headers = [
    "First name",
    "Last name",
    "Email",
    "Company",
    "Title",
    "Phone",
    "Industry professional",
    "Added",
    "Source",
    ...(includeSuppressed ? ["Sendable", "Do-not-email reason"] : []),
    ...(withUnsubscribe ? ["Unsubscribe link"] : []),
  ];

  const body = members.map((m) => [
    m.first_name ?? "",
    m.last_name ?? "",
    m.email ?? "",
    m.company_name ?? "",
    m.title ?? "",
    m.phone ?? "",
    m.is_professional ? "yes" : "no",
    m.added_at ? new Date(m.added_at as string).toISOString().slice(0, 10) : "",
    m.source ?? "",
    ...(includeSuppressed
      ? [m.sendable ? "yes" : "no", (m.suppression_reason as string) ?? ""]
      : []),
    ...(withUnsubscribe ? [(m.email ? unsubscribeUrl(String(m.email)) : "") ?? ""] : []),
  ]);

  const slug = String(list.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "list";

  return csvResponse(
    toCsv(headers, body),
    includeSuppressed ? `${slug}-including-do-not-email` : `${slug}-mailable`,
  );
}
