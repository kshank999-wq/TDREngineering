"use server";

import { getClientUser, supabaseServer } from "@/lib/supabase/server";
import { DOWNLOAD_TTL_SECONDS } from "@/lib/storage/job-files";
import { signedDownloadUrl } from "@/lib/storage/providers";

/**
 * Portal server actions.
 *
 * AUTHORIZATION IS THE DATABASE'S DECISION, NOT THIS FILE'S
 *
 * The download below reads the file through the client's own session first. If
 * the database will not return that row — wrong client, file not shared, grant
 * deactivated — there is nothing to sign and the action stops. Only once the
 * row comes back does it use the service role to mint the URL, because clients
 * have no storage access of their own and never should.
 *
 * Written in that order deliberately: the service-role client is never reached
 * with an id that has not already passed the database's own check.
 */

export async function getPortalDownloadUrl(
  fileId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const client = await getClientUser();
  if (!client) return { ok: false, error: "Please sign in again." };
  if (!fileId) return { ok: false, error: "No file requested." };

  // The authorization check. v_portal_files filters through
  // client_can_see_job() and only exposes files marked client_visible.
  const supabase = await supabaseServer();
  const { data: file } = await supabase
    .from("v_portal_files")
    .select("storage_provider, storage_bucket, storage_path, original_filename")
    .eq("id", fileId)
    .maybeSingle();

  if (!file) return { ok: false, error: "That file is not available." };

  // Drive has no signed link, so the client is pointed at a route that streams
  // the bytes through the server. That route repeats this same authorization
  // check — it does not trust having been linked to.
  if (file.storage_provider === "google_drive") {
    return { ok: true, url: `/portal/files/${fileId}` };
  }

  // Only now — after the database has released the row — is storage reached,
  // and via the provider recorded on the file itself. A deliverable uploaded
  // before the move to cloud storage and one uploaded after both download.
  const signed = await signedDownloadUrl({
    provider: file.storage_provider as string,
    bucket: file.storage_bucket as string,
    path: file.storage_path as string,
    expiresIn: DOWNLOAD_TTL_SECONDS,
    downloadAs: file.original_filename as string,
  });

  if (!signed.ok) return { ok: false, error: "Could not prepare that download." };
  return { ok: true, url: signed.url };
}

/** Records that the client has been in, so staff can see the portal is used. */
export async function touchLastSeen(): Promise<void> {
  const client = await getClientUser();
  if (!client) return;
  const supabase = await supabaseServer();
  await supabase
    .from("client_portal_access")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", client.id);
}
