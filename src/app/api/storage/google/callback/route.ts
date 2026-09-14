import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { getStaffUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  exchangeCode,
  getAccountEmail,
  ensureFolder,
  driveRedirectUri,
} from "@/lib/storage/google-drive";
import { encryptSecret, keyIsUsable } from "@/lib/storage/secrets";
import { env } from "@/lib/env";

/**
 * Step two: Google sends the owner back with a one-time code.
 *
 * Exchange it for a refresh token, encrypt that, and make the folder. The
 * refresh token exists in memory for the length of this request and is written
 * to the database only as ciphertext — it is never logged, never returned to
 * the browser, and never put in a redirect.
 */

export const dynamic = "force-dynamic";

const SETTINGS = "/admin/settings/storage";

function back(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL(SETTINGS, request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const jar = await cookies();
  const expected = jar.get("google_oauth_state")?.value ?? "";
  // One-shot: consumed whatever happens, so a replayed callback cannot work.
  jar.delete("google_oauth_state");

  const staff = await getStaffUser();
  if (!staff || (staff.role !== "owner" && staff.role !== "manager")) {
    return back(request, { error: "forbidden" });
  }

  const url = new URL(request.url);

  // The owner clicked Cancel, or Google refused.
  const denied = url.searchParams.get("error");
  if (denied) return back(request, { error: "denied" });

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  if (!code || !state || !expected) return back(request, { error: "state" });

  // Constant-time, and length-checked first because timingSafeEqual throws on
  // a mismatch. A state comparison is not a high-value timing target, but
  // comparing security tokens with === is a habit worth not having.
  const a = Buffer.from(state, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return back(request, { error: "state" });
  }

  if (!env.googleClientId || !env.googleClientSecret) {
    return back(request, { error: "unconfigured" });
  }
  if (!keyIsUsable(env.storageTokenKey)) return back(request, { error: "nokey" });

  const exchanged = await exchangeCode({
    code,
    clientId: env.googleClientId,
    clientSecret: env.googleClientSecret,
    redirectUri: driveRedirectUri(url.origin),
  });

  if (!exchanged.ok) {
    return back(request, { error: "exchange", detail: exchanged.error.slice(0, 200) });
  }

  const accountEmail = await getAccountEmail({ accessToken: exchanged.accessToken });

  // The folder is created now rather than on first upload, so a connection
  // that looks finished on screen really is finished.
  const folder = await ensureFolder({
    accessToken: exchanged.accessToken,
    name: "TDR Job Files",
  });

  if (!folder.ok) {
    return back(request, { error: "folder", detail: folder.error.slice(0, 200) });
  }

  const admin = supabaseAdmin();

  // Any previous connection is retired rather than deleted — the partial
  // unique index allows only one active row, and the old row is worth keeping
  // as a record of which account was connected and when.
  await admin
    .from("storage_connections")
    .update({ is_active: false })
    .eq("provider", "google_drive")
    .eq("is_active", true);

  const { error } = await admin.from("storage_connections").insert({
    provider: "google_drive",
    account_email: accountEmail,
    refresh_token_enc: encryptSecret(exchanged.refreshToken, env.storageTokenKey),
    folder_id: folder.folderId,
    folder_name: "TDR Job Files",
    scopes: exchanged.scope,
    is_active: true,
    connected_by: staff.id,
  });

  if (error) return back(request, { error: "save", detail: error.message.slice(0, 200) });

  return back(request, { connected: "1" });
}
