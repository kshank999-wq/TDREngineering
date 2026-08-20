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
} as const;

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
