import { NextResponse } from "next/server";
import { inquirySchema, fieldErrors } from "@/lib/validation";
import { checkSpam, hashIp } from "@/lib/spam";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findOrCreateContact, findOrCreateCompany } from "@/lib/intake";
import { sendEmail } from "@/lib/email/send";
import { inquiryNotification, inquiryConfirmation } from "@/lib/email/templates";
import { env } from "@/lib/env";

/**
 * General contact-page inquiries (spec §11 `website_inquiries`).
 *
 * Same durability rule as the proposal route: the database row is written
 * first and an email failure never loses the message.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIp(request);

  const limit = rateLimit(`inquiry:${ip}`, 5, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many messages from this connection. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const parsed = inquirySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please correct the highlighted fields.",
        fields: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const spam = await checkSpam({
    honeypot: input.website,
    elapsedMs: input.elapsedMs,
    turnstileToken: input.turnstileToken,
    ip,
  });
  if (!spam.ok) {
    console.warn(`[inquiries] rejected submission (${spam.reason}) from ${hashIp(ip)}`);
    return NextResponse.json(
      { ok: false, error: "We could not verify this submission. Please try again." },
      { status: 400 },
    );
  }

  try {
    const db = supabaseAdmin();
    const companyId = input.company
      ? await findOrCreateCompany(db, input.company)
      : null;
    const contactId = await findOrCreateContact(db, {
      firstName: input.firstName,
      lastName: input.lastName || input.firstName,
      email: input.email,
      phone: input.phone,
      companyId,
    });

    const { error } = await db.from("website_inquiries").insert({
      first_name: input.firstName,
      last_name: input.lastName || null,
      email: input.email,
      phone: input.phone || null,
      company: input.company || null,
      subject: input.subject || null,
      message: input.message,
      source_page: input.sourcePage || null,
      contact_id: contactId,
      submitted_ip_hash: hashIp(ip),
      submitted_user_agent: (request.headers.get("user-agent") ?? "").slice(0, 500),
    });
    if (error) throw error;
  } catch (error) {
    console.error("[inquiries] Failed to persist inquiry:", error);
    return NextResponse.json(
      { ok: false, error: "We could not send your message. Please call TDR directly." },
      { status: 500 },
    );
  }

  const notification = inquiryNotification(input);
  const confirmation = inquiryConfirmation(input);

  await Promise.all([
    env.proposalNotificationTo.length
      ? sendEmail({
          to: env.proposalNotificationTo,
          subject: notification.subject,
          html: notification.html,
          text: notification.text,
          replyTo: input.email,
        })
      : Promise.resolve({ ok: true }),
    sendEmail({
      to: [input.email],
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
    }),
  ]);

  return NextResponse.json({ ok: true });
}
