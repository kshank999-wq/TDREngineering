/**
 * Environment access with explicit failure messages.
 *
 * Nothing here throws at import time: a missing Supabase key must not take the
 * whole marketing site down. Routes that genuinely need a value call
 * `requireEnv` and fail loudly at request time instead.
 */

export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://www.tdrengineering.com",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  proposalBucket: process.env.SUPABASE_PROPOSAL_BUCKET || "proposal-uploads",
  emailProvider: (process.env.EMAIL_PROVIDER || "console") as "resend" | "console",
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom:
    process.env.EMAIL_FROM || "TDR Engineering <no-reply@mail.tdrengineering.com>",
  emailReplyTo: process.env.EMAIL_REPLY_TO || "info@tdrengineering.com",
  proposalNotificationTo: (process.env.PROPOSAL_NOTIFICATION_TO || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",
  turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || "",

  // --- Shipping (Shippo) ------------------------------------------------
  shippoToken: process.env.SHIPPO_API_TOKEN || "",
  /**
   * Where labels ship FROM. Kept separate from `site.address` on purpose:
   * the marketing address is still unverified, and a firm's shipping origin
   * is not always the address it publishes.
   */
  shipFrom: {
    name: process.env.SHIP_FROM_NAME || "TDR Engineering",
    street1: process.env.SHIP_FROM_STREET1 || "",
    street2: process.env.SHIP_FROM_STREET2 || "",
    city: process.env.SHIP_FROM_CITY || "",
    state: process.env.SHIP_FROM_STATE || "",
    zip: process.env.SHIP_FROM_ZIP || "",
    country: process.env.SHIP_FROM_COUNTRY || "US",
    phone: process.env.SHIP_FROM_PHONE || "",
    email: process.env.SHIP_FROM_EMAIL || "",
  },
} as const;

/** Shipping is only offered when a token and a complete origin exist. */
export const isShippingConfigured = () =>
  Boolean(
    env.shippoToken &&
      env.shipFrom.street1 &&
      env.shipFrom.city &&
      env.shipFrom.state &&
      env.shipFrom.zip,
  );

/**
 * Shippo test tokens are prefixed `shippo_test_`. Labels bought with one are
 * not real postage — the UI must say so, loudly, or someone will drop a test
 * label in the mail.
 */
export const isShippoTestMode = () => env.shippoToken.startsWith("shippo_test_");

export function requireEnv(value: string, name: string): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

export const isSupabaseConfigured = () =>
  Boolean(env.supabaseUrl && env.supabaseAnonKey);
