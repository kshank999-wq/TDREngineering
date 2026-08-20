import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Bot protection for the public forms (spec §9 step 2, §15).
 *
 * Three independent layers, cheapest first:
 *   1. Honeypot field — hidden from real users, filled by naive bots.
 *   2. Timing check — a human cannot complete this form in under 3 seconds.
 *   3. Cloudflare Turnstile — verified server-side when configured.
 *
 * Turnstile is optional so the form can go live before the keys exist, but it
 * should be enabled before launch. `turnstileConfigured()` lets the launch
 * checklist assert that it is.
 */

const MIN_ELAPSED_MS = 3000;

export type SpamCheck = { ok: true } | { ok: false; reason: string };

export function turnstileConfigured(): boolean {
  return Boolean(env.turnstileSiteKey && env.turnstileSecretKey);
}

export async function checkSpam(input: {
  honeypot: string;
  elapsedMs: number;
  turnstileToken: string;
  ip: string;
}): Promise<SpamCheck> {
  if (input.honeypot) {
    return { ok: false, reason: "honeypot" };
  }
  // elapsedMs is 0 when JavaScript never ran; don't punish that case, only
  // punish an implausibly fast completion.
  if (input.elapsedMs > 0 && input.elapsedMs < MIN_ELAPSED_MS) {
    return { ok: false, reason: "too-fast" };
  }
  if (turnstileConfigured()) {
    const ok = await verifyTurnstile(input.turnstileToken, input.ip);
    if (!ok) return { ok: false, reason: "turnstile" };
  }
  return { ok: true };
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new URLSearchParams({
      secret: env.turnstileSecretKey,
      response: token,
    });
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body, cache: "no-store" },
    );
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    // A Turnstile outage must not silently drop legitimate business. Log and
    // let the submission through — the honeypot and timing checks still apply.
    console.error("[spam] Turnstile verification failed:", error);
    return true;
  }
}

/**
 * One-way hash of the submitter IP. Stored for abuse investigation without
 * retaining the raw address.
 */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`tdr:${ip}`).digest("hex").slice(0, 32);
}
