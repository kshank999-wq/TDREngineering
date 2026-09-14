import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getStaffUser } from "@/lib/supabase/server";
import { authorizeUrl, driveRedirectUri } from "@/lib/storage/google-drive";
import { env } from "@/lib/env";
import { keyIsUsable } from "@/lib/storage/secrets";

/**
 * Step one of connecting a Drive: send an owner to Google's consent screen.
 *
 * The `state` parameter is a CSRF guard, not decoration. Without it, somebody
 * could trick a signed-in owner into completing an OAuth flow that connects an
 * ATTACKER'S Drive to TDR's account — after which every job file uploaded goes
 * into a stranger's storage. A random value is put in a short-lived, httpOnly
 * cookie and checked on the way back.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Connecting storage binds the firm's files to one Google account, so this
  // is owners and managers rather than all staff.
  const staff = await getStaffUser();
  if (!staff || (staff.role !== "owner" && staff.role !== "manager")) {
    return NextResponse.redirect(new URL("/admin/settings/storage?error=forbidden", request.url));
  }

  if (!env.googleClientId || !env.googleClientSecret) {
    return NextResponse.redirect(
      new URL("/admin/settings/storage?error=unconfigured", request.url),
    );
  }
  if (!keyIsUsable(env.storageTokenKey)) {
    // Refusing here rather than later matters: without the key the refresh
    // token would have to be stored in plain text, and that is not a trade
    // worth making to save somebody a configuration step.
    return NextResponse.redirect(new URL("/admin/settings/storage?error=nokey", request.url));
  }

  const state = randomBytes(32).toString("base64url");
  const jar = await cookies();
  jar.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the redirect back from Google
    path: "/api/storage/google",
    maxAge: 600, // ten minutes is plenty to click Allow
  });

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(
    authorizeUrl({
      clientId: env.googleClientId,
      redirectUri: driveRedirectUri(origin),
      state,
    }),
  );
}
