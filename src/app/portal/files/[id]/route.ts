import { NextResponse } from "next/server";
import { getClientUser, supabaseServer } from "@/lib/supabase/server";
import { driveDownload } from "@/lib/storage/providers";

/**
 * Streaming a Google Drive file to a client.
 *
 * WHY THIS ROUTE EXISTS AT ALL
 *
 * Every other provider hands back a signed URL and the browser fetches the
 * bytes directly. Drive cannot: a read needs an `Authorization` header, and
 * that header carries access to every file this application has created. It
 * can never be given to a browser.
 *
 * So for Drive — and only for Drive, and only for clients — the bytes pass
 * through here. Staff never take this path; they get Drive's own web view,
 * which has no size limit.
 *
 * THE BODY IS PIPED, NOT BUFFERED
 *
 * `response.body` is handed straight to the client. A 200 MB drawing is never
 * held in the function's memory, which is the difference between this working
 * and the function being killed.
 *
 * Even so, this is the wrong tool for a multi-gigabyte point cloud: a
 * serverless function has a wall-clock limit and a slow client will hit it.
 * Client deliverables are drawings and reports, and those are fine.
 *
 * AUTHORIZATION IS THE DATABASE'S DECISION
 *
 * `v_portal_files` filters through `client_can_see_job()` and exposes only
 * files marked client-visible. If it will not return the row, there is nothing
 * to stream — Drive is never reached with an id the database has not released.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getClientUser();
  if (!client) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: file } = await supabase
    .from("v_portal_files")
    .select("storage_provider, storage_path, original_filename, content_type")
    .eq("id", id)
    .maybeSingle();

  if (!file) {
    // Same answer whether the file does not exist or belongs to another
    // client. Distinguishing them would confirm it exists.
    return NextResponse.json({ error: "That file is not available." }, { status: 404 });
  }

  if (file.storage_provider !== "google_drive") {
    return NextResponse.json(
      { error: "That file is not served from this route." },
      { status: 400 },
    );
  }

  const result = await driveDownload(file.storage_path as string);
  if (!result.ok || !result.response.body) {
    return NextResponse.json({ error: "Could not fetch that file." }, { status: 502 });
  }

  const filename = String(file.original_filename ?? "download").replace(/"/g, "");
  const headers = new Headers({
    "content-type": (file.content_type as string) || "application/octet-stream",
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
  });

  // Passed through when Google sends it, so the browser can show a progress
  // bar rather than an indeterminate spinner on a large drawing.
  const length = result.response.headers.get("content-length");
  if (length) headers.set("content-length", length);

  return new NextResponse(result.response.body, { status: 200, headers });
}
