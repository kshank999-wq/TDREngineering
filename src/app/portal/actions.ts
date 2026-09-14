"use server";

import { getClientUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DOWNLOAD_TTL_SECONDS } from "@/lib/storage/job-files";

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
    .select("storage_bucket, storage_path, original_filename")
    .eq("id", fileId)
    .maybeSingle();

  if (!file) return { ok: false, error: "That file is not available." };

  const { data, error } = await supabaseAdmin()
    .storage.from(file.storage_bucket as string)
    .createSignedUrl(file.storage_path as string, DOWNLOAD_TTL_SECONDS, {
      download: file.original_filename as string,
    });

  if (error || !data) return { ok: false, error: "Could not prepare that download." };
  return { ok: true, url: data.signedUrl };
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
