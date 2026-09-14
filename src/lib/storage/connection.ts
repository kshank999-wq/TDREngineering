import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { decryptSecret, keyIsUsable } from "@/lib/storage/secrets";
import { getAccessToken } from "@/lib/storage/google-drive";

/**
 * Reading the connected Drive account, and turning it into a usable token.
 *
 * Read with the SERVICE ROLE on purpose. The refresh token column is behind an
 * admin-only RLS policy, but an upload is performed by ordinary staff and a
 * client portal download by somebody who is not staff at all — neither can be
 * allowed to read the credential, and neither needs to: this module reads it
 * on their behalf and hands back only a short-lived access token.
 *
 * The token itself never leaves the server. It is not returned to a browser,
 * not put in a URL, and not written to the files table.
 */

export type DriveConnection = {
  id: string;
  accountEmail: string | null;
  folderId: string | null;
  folderName: string | null;
  driveId: string | null;
};

export type ConnectionResult =
  | { ok: true; connection: DriveConnection; accessToken: string }
  | { ok: false; error: string };

/** The connection as the settings screen sees it — no token, ever. */
export async function readConnection(): Promise<DriveConnection | null> {
  const { data } = await supabaseAdmin()
    .from("storage_connections")
    .select("id, account_email, folder_id, folder_name, drive_id")
    .eq("provider", "google_drive")
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    accountEmail: (data.account_email as string) ?? null,
    folderId: (data.folder_id as string) ?? null,
    folderName: (data.folder_name as string) ?? null,
    driveId: (data.drive_id as string) ?? null,
  };
}

export async function driveIsConnected(): Promise<boolean> {
  const connection = await readConnection();
  return Boolean(connection?.folderId);
}

/**
 * A live access token, or a sentence explaining why not.
 *
 * Every failure here is recorded on the connection row, so a Drive that stopped
 * working shows up on the settings screen instead of being discovered by
 * whoever next tries to upload.
 */
export async function connectedDrive(): Promise<ConnectionResult> {
  if (!env.googleClientId || !env.googleClientSecret) {
    return {
      ok: false,
      error: "Google Drive is not configured on this deployment.",
    };
  }
  if (!keyIsUsable(env.storageTokenKey)) {
    return {
      ok: false,
      error: "STORAGE_TOKEN_KEY is missing, so the stored Drive credentials cannot be read.",
    };
  }

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("storage_connections")
    .select("id, account_email, folder_id, folder_name, drive_id, refresh_token_enc")
    .eq("provider", "google_drive")
    .eq("is_active", true)
    .maybeSingle();

  if (!data?.refresh_token_enc) {
    return { ok: false, error: "No Google Drive account is connected." };
  }

  const refreshToken = decryptSecret(data.refresh_token_enc as string, env.storageTokenKey);
  if (!refreshToken) {
    // Either the key changed or the row was tampered with. Both mean the same
    // thing to whoever is looking at the screen.
    await recordError(data.id as string, "The stored credentials could not be decrypted.");
    return {
      ok: false,
      error:
        "The stored Google credentials could not be read. Reconnect the Drive account in Settings.",
    };
  }

  const token = await getAccessToken({
    clientId: env.googleClientId,
    clientSecret: env.googleClientSecret,
    refreshToken,
  });

  if (!token.ok) {
    await recordError(data.id as string, token.error);
    return { ok: false, error: token.error };
  }

  // Clear any previous failure and note that it worked.
  await admin
    .from("storage_connections")
    .update({ last_used_at: new Date().toISOString(), last_error: null, last_error_at: null })
    .eq("id", data.id as string);

  return {
    ok: true,
    accessToken: token.accessToken,
    connection: {
      id: data.id as string,
      accountEmail: (data.account_email as string) ?? null,
      folderId: (data.folder_id as string) ?? null,
      folderName: (data.folder_name as string) ?? null,
      driveId: (data.drive_id as string) ?? null,
    },
  };
}

async function recordError(id: string, message: string): Promise<void> {
  try {
    await supabaseAdmin()
      .from("storage_connections")
      .update({ last_error: message.slice(0, 500), last_error_at: new Date().toISOString() })
      .eq("id", id);
  } catch {
    // Recording the failure must never become the failure.
  }
}
