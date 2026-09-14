import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MARKETING_DOWNLOAD_TTL_SECONDS } from "@/lib/marketing/storage";

/**
 * The download behind a shared marketing link.
 *
 * Order is the security property, as everywhere else here:
 *
 *   1. `marketing_asset_download()` decides. It checks the asset is still
 *      shared, still live and has a current version, records the download, and
 *      only then returns where the bytes are.
 *   2. The service role mints a short-lived signed URL for that exact path.
 *
 * The storage client is never reached with a path the database has not already
 * released, so a visitor cannot ask for a file — only for "whatever this link
 * currently points at".
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug || slug.length > 60) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("marketing_asset_download", { p_slug: slug });

  const file = Array.isArray(data) ? data[0] : data;
  if (error || !file?.storage_bucket || !file?.storage_path) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(file.storage_bucket)
    .createSignedUrl(file.storage_path, MARKETING_DOWNLOAD_TTL_SECONDS, {
      download: file.original_filename ?? "download",
    });

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  // Redirect rather than proxy: the bytes never pass through the function, so
  // a large brochure is not bounded by the serverless response limit.
  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
