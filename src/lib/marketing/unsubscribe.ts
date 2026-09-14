import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Unsubscribe links.
 *
 * WHY THIS IS DERIVED RATHER THAN STORED
 *
 * A proposal signing token is minted once and handed over, so storing only its
 * hash works. An unsubscribe link is different: it has to appear in EVERY
 * email, for years, and be re-derivable each time. A stored hash cannot be
 * reversed to rebuild the link, and storing the raw token would put a working
 * opt-out credential for every prospect in the database.
 *
 * So it is an HMAC of the address under a server secret. Nothing is stored,
 * the link is identical every time it is generated, and it cannot be forged
 * without the secret.
 *
 * ROTATING THE SECRET INVALIDATES EVERY LINK ALREADY SENT. That is a real
 * cost — an unsubscribe link that stops working is the specific failure
 * CAN-SPAM cares about — so `MARKETING_UNSUBSCRIBE_SECRET` should be set once
 * and left alone.
 *
 * The token carries the address so the page knows who to unsubscribe. That is
 * not a leak: the only person holding the link is the person whose address it
 * is, and it was just emailed to them.
 */

const MIN_SECRET_LENGTH = 24;

export function unsubscribeConfigured(): boolean {
  return env.marketingUnsubscribeSecret.length >= MIN_SECRET_LENGTH;
}

function sign(email: string): string {
  return createHmac("sha256", env.marketingUnsubscribeSecret)
    .update(email.trim().toLowerCase(), "utf8")
    .digest("base64url")
    .slice(0, 32);
}

/**
 * Returns null when no secret is configured.
 *
 * Deliberately null rather than an unsigned link: a link that looks like an
 * unsubscribe but cannot verify is worse than no link, because it would be
 * sent to real people and fail when they clicked it.
 */
export function unsubscribeToken(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !unsubscribeConfigured()) return null;
  return `${Buffer.from(normalized, "utf8").toString("base64url")}.${sign(normalized)}`;
}

export function unsubscribeUrl(email: string): string | null {
  const token = unsubscribeToken(email);
  if (!token) return null;
  return `${env.siteUrl.replace(/\/$/, "")}/unsubscribe/${token}`;
}

/** Returns the address the token attests to, or null if it does not verify. */
export function verifyUnsubscribeToken(token: string): string | null {
  if (!token || !unsubscribeConfigured()) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let email: string;
  try {
    email = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  if (!email || !email.includes("@") || email.length > 320) return null;

  const expected = sign(email);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return email.trim().toLowerCase();
}
