import "server-only";
import { env } from "@/lib/env";

/**
 * Transactional email abstraction (spec §13, §20 "abstraction layer" pattern).
 *
 * The website sends only transactional mail — proposal confirmations and TDR
 * notifications. It must never be used for newsletters or bulk marketing:
 * spec §13 requires that operational @tdrengineering.com reputation stays
 * protected and that campaigns run through a separate campaign system.
 *
 * Swapping providers means adding a case here, not touching call sites.
 */

export type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type EmailResult = { ok: boolean; id?: string; error?: string };

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (message.to.length === 0) {
    return { ok: false, error: "No recipients" };
  }

  switch (env.emailProvider) {
    case "resend":
      return sendWithResend(message);
    case "console":
    default:
      // Development / pre-provider fallback. The submission is already durable
      // in Supabase, so logging here loses nothing (spec §9).
      console.info(
        `[email:console] to=${message.to.join(", ")} subject=${message.subject}\n${message.text}`,
      );
      return { ok: true, id: "console" };
  }
}

async function sendWithResend(message: EmailMessage): Promise<EmailResult> {
  if (!env.resendApiKey) {
    console.error("[email] EMAIL_PROVIDER=resend but RESEND_API_KEY is unset");
    return { ok: false, error: "Email provider is not configured" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo || env.emailReplyTo,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`[email] Resend rejected the message: ${response.status} ${detail}`);
      return { ok: false, error: `Provider responded ${response.status}` };
    }
    const data = (await response.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (error) {
    console.error("[email] Send failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Send failed" };
  }
}
