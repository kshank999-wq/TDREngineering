import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { proposalSchema, fieldErrors } from "@/lib/validation";
import { validateFile, MAX_FILES, MAX_TOTAL_BYTES } from "@/lib/uploads";
import { checkSpam, hashIp } from "@/lib/spam";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { createProposalRecord, recordFileMetadata } from "@/lib/intake";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { proposalConfirmation, proposalNotification } from "@/lib/email/templates";
import { env } from "@/lib/env";

/**
 * Request for Proposal intake (spec §7, §9).
 *
 * No authentication: many TDR jobs are one-off residential, boundary,
 * architectural or referral-based projects, and requiring a login would lose
 * them (spec §7).
 *
 * Order of operations matters. The database write happens BEFORE any email is
 * attempted, and an email failure never fails the request — spec §9: "A
 * proposal request must not disappear merely because an email notification is
 * missed."
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIp(request);

  // Coarse abuse throttle. Generous enough that a firm submitting several
  // projects in one sitting is never blocked.
  const limit = rateLimit(`proposal:${ip}`, 5, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Too many submissions from this connection. Please wait a few minutes, or call TDR directly.",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read the submitted form." },
      { status: 400 },
    );
  }

  // --- 1. Validate form input (spec §9 step 1) ----------------------------
  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") {
    return NextResponse.json({ ok: false, error: "Missing form data." }, { status: 400 });
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed form data." }, { status: 400 });
  }

  const parsed = proposalSchema.safeParse(parsedPayload);
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

  // --- 1b. Validate file input -------------------------------------------
  const uploads = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (uploads.length > MAX_FILES) {
    return NextResponse.json(
      { ok: false, error: `Please attach no more than ${MAX_FILES} files.` },
      { status: 422 },
    );
  }

  let totalBytes = 0;
  for (const file of uploads) {
    const check = validateFile(file);
    if (!check.ok) {
      return NextResponse.json({ ok: false, error: check.error }, { status: 422 });
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `Attachments total more than ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB. Send the largest files to TDR separately and we will arrange a transfer.`,
      },
      { status: 422 },
    );
  }

  // --- 2. Spam / bot protection (spec §9 step 2) -------------------------
  const spam = await checkSpam({
    honeypot: input.website,
    elapsedMs: input.elapsedMs,
    turnstileToken: input.turnstileToken,
    ip,
  });
  if (!spam.ok) {
    console.warn(`[proposals] rejected submission (${spam.reason}) from ${hashIp(ip)}`);
    // Deliberately vague: a bot should not learn which check caught it.
    return NextResponse.json(
      { ok: false, error: "We could not verify this submission. Please try again." },
      { status: 400 },
    );
  }

  // --- 3–7. Persist the request (contact, company, property, referral) ----
  let record;
  try {
    record = await createProposalRecord(input, {
      ipHash: hashIp(ip),
      userAgent: request.headers.get("user-agent") ?? "",
      sourcePage: input.sourcePage,
    });
  } catch (error) {
    console.error("[proposals] Failed to persist proposal request:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "We could not save your request. Please try again, or contact TDR directly so your project is not delayed.",
      },
      { status: 500 },
    );
  }

  // --- 8. Store attachments and their metadata ---------------------------
  let storedFileCount = 0;
  if (uploads.length > 0) {
    try {
      storedFileCount = await storeUploads(record.opportunityId, uploads);
    } catch (error) {
      // The proposal itself is already safe. Log loudly and tell TDR in the
      // notification rather than discarding a valid request.
      console.error(
        `[proposals] Attachment storage failed for ${record.opportunityNumber}:`,
        error,
      );
    }
  }

  // --- 9/10. Notifications. Never fatal. ---------------------------------
  const adminUrl = `${env.siteUrl}/admin/proposals/${record.opportunityId}`;

  const notification = proposalNotification(input, record.opportunityNumber, {
    fileCount: storedFileCount,
    adminUrl,
  });
  const confirmation = proposalConfirmation(input, record.opportunityNumber);

  const [tdrResult, prospectResult] = await Promise.all([
    env.proposalNotificationTo.length
      ? sendEmail({
          to: env.proposalNotificationTo,
          subject: notification.subject,
          html: notification.html,
          text: notification.text,
          replyTo: input.email,
        })
      : Promise.resolve({ ok: false, error: "PROPOSAL_NOTIFICATION_TO is unset" }),
    sendEmail({
      to: [input.email],
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
    }),
  ]);

  if (!tdrResult.ok) {
    console.error(
      `[proposals] TDR notification failed for ${record.opportunityNumber}: ${tdrResult.error}`,
    );
  }
  if (!prospectResult.ok) {
    console.error(
      `[proposals] Prospect confirmation failed for ${record.opportunityNumber}: ${prospectResult.error}`,
    );
  }

  return NextResponse.json({
    ok: true,
    opportunityNumber: record.opportunityNumber,
    filesStored: storedFileCount,
  });
}

/**
 * Uploads attachments to the private Supabase Storage bucket and records their
 * metadata. Returns the number of files successfully stored.
 */
async function storeUploads(opportunityId: string, uploads: File[]): Promise<number> {
  const db = supabaseAdmin();
  const bucket = env.proposalBucket;
  const stored: Parameters<typeof recordFileMetadata>[1] = [];

  for (const [index, file] of uploads.entries()) {
    const check = validateFile(file);
    if (!check.ok) continue;

    const buffer = Buffer.from(await file.arrayBuffer());
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const path = `${opportunityId}/${String(index + 1).padStart(2, "0")}-${check.safeName}`;

    const { error } = await db.storage.from(bucket).upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (error) {
      console.error(`[proposals] Upload failed for ${check.safeName}:`, error);
      continue;
    }

    stored.push({
      bucket,
      path,
      originalFilename: file.name.slice(0, 200),
      contentType: file.type || null,
      byteSize: file.size,
      checksum,
    });
  }

  await recordFileMetadata(opportunityId, stored);
  return stored.length;
}
