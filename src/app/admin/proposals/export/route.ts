import { NextResponse } from "next/server";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";

/**
 * CSV export of proposal requests (spec §10: "Export proposal data if needed";
 * spec §15: "Periodic independent data exports").
 *
 * Reads through the RLS-scoped session client, so an unauthenticated or
 * non-staff caller gets nothing regardless of what this route does.
 */

export const dynamic = "force-dynamic";

const COLUMNS = [
  "opportunity_number",
  "project_number",
  "status",
  "submitted_at",
  "contact_first_name",
  "contact_last_name",
  "contact_email",
  "contact_phone",
  "company_name",
  "property_address",
  "property_city",
  "property_postal_code",
  "property_apn",
  "referral_source",
  "referral_first_name",
  "referral_last_name",
  "referral_company_name",
  "referral_raw_name",
  "referral_raw_company",
  "project_description",
] as const;

/** RFC 4180 quoting, plus a leading apostrophe on anything a spreadsheet
 *  would otherwise evaluate as a formula. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const staff = await getStaffUser();
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? "";

  const supabase = await supabaseServer();
  let request_ = supabase
    .from("v_opportunity_search")
    .select(COLUMNS.join(","))
    .order("submitted_at", { ascending: false })
    .limit(5000);

  if (status) request_ = request_.eq("status", status);
  if (query) request_ = request_.ilike("search_text", `%${query}%`);

  const { data, error } = await request_;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const csv = [
    COLUMNS.join(","),
    ...rows.map((row) => COLUMNS.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tdr-proposal-requests-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
