import { site } from "@/content/site";
import { serviceByCode } from "@/content/services";
import { referralSourceByCode } from "@/content/referrals";
import type { ProposalInput, InquiryInput } from "@/lib/validation";

/**
 * Plain, deliberately simple HTML. Transactional mail renders in dozens of
 * clients; a table-free single-column layout with inline styles is the format
 * that survives all of them.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16202b;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <div style="font-size:18px;font-weight:700;letter-spacing:0.04em;color:#0f3d5c;margin-bottom:24px;">TDR ENGINEERING</div>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #e3e6ea;margin:32px 0 16px;">
    <div style="font-size:12px;color:#6b7684;line-height:1.6;">
      ${escapeHtml(site.name)}<br>
      <a href="${site.url}" style="color:#0f3d5c;">${site.url.replace(/^https?:\/\//, "")}</a>
    </div>
  </div>
</body></html>`;
}

function row(label: string, value: string): string {
  if (!value) return "";
  return `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;"><strong style="color:#4a5560;">${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
}

function serviceNames(codes: string[]): string {
  return codes.map((c) => serviceByCode(c)?.name ?? c).join(", ");
}

/** Sent to the prospect. Confirms receipt and states what happens next. */
export function proposalConfirmation(input: ProposalInput, opportunityNumber: string) {
  const subject = `We received your proposal request — ${opportunityNumber}`;

  const text = [
    `Hello ${input.firstName},`,
    ``,
    `Thank you for contacting TDR Engineering. We have received your request for a proposal and it has been logged as reference ${opportunityNumber}.`,
    ``,
    `WHAT YOU SENT US`,
    `Project address: ${input.projectAddress}, ${input.city}${input.zip ? " " + input.zip : ""}`,
    `Services requested: ${serviceNames(input.services)}`,
    input.timeframe ? `Requested timeframe: ${input.timeframe}` : ``,
    ``,
    `WHAT HAPPENS NEXT`,
    `A member of the TDR team will review your project and follow up${input.preferredContact ? ` by ${input.preferredContact.toLowerCase()}` : ""}. If we need any additional information to prepare an accurate proposal, we will ask for it directly.`,
    ``,
    `If anything changes in the meantime, reply to this email and reference ${opportunityNumber}.`,
    ``,
    `TDR Engineering`,
    site.url,
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const html = layout(
    subject,
    `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">Thank you — we have your request</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Hello ${escapeHtml(input.firstName)}, thank you for contacting TDR Engineering. Your request has been logged as reference <strong>${escapeHtml(opportunityNumber)}</strong>.</p>

    <h2 style="margin:28px 0 12px;font-size:15px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7684;">What you sent us</h2>
    ${row("Project address", `${input.projectAddress}, ${input.city}${input.zip ? " " + input.zip : ""}`)}
    ${row("Services requested", serviceNames(input.services))}
    ${row("Requested timeframe", input.timeframe ?? "")}

    <h2 style="margin:28px 0 12px;font-size:15px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7684;">What happens next</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">A member of the TDR team will review your project and follow up${input.preferredContact ? ` by ${escapeHtml(input.preferredContact.toLowerCase())}` : ""}. If we need additional information to prepare an accurate proposal, we will ask for it directly.</p>
    <p style="margin:0;font-size:15px;line-height:1.6;">If anything changes in the meantime, reply to this email and reference ${escapeHtml(opportunityNumber)}.</p>
  `,
  );

  return { subject, html, text };
}

/** Sent to TDR. Contains everything needed to act without opening the admin. */
export function proposalNotification(
  input: ProposalInput,
  opportunityNumber: string,
  meta: { fileCount: number; adminUrl: string },
) {
  const referral = referralSourceByCode(input.referralSource);
  const subject = `New proposal request — ${input.projectAddress}, ${input.city} (${opportunityNumber})`;

  const detailEntries = Object.entries(input.serviceDetails ?? {}).filter(
    ([, v]) => v && v.trim(),
  );

  const text = [
    `NEW PROPOSAL REQUEST — ${opportunityNumber}`,
    ``,
    `CONTACT`,
    `${input.firstName} ${input.lastName}${input.company ? ` (${input.company})` : ""}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone || "not provided"}`,
    `Preferred contact: ${input.preferredContact || "not specified"}`,
    ``,
    `PROJECT`,
    `Address: ${input.projectAddress}, ${input.city}${input.state ? ", " + input.state : ""} ${input.zip}`.trim(),
    `APN: ${input.apn || "not provided"}`,
    `Property type: ${input.propertyType}`,
    `Approximate size: ${input.approximateSize || "not provided"}`,
    `Timeframe: ${input.timeframe || "not specified"}`,
    ``,
    `SERVICES REQUESTED`,
    serviceNames(input.services),
    ``,
    detailEntries.length ? `SERVICE DETAILS` : ``,
    ...detailEntries.map(([k, v]) => `${k}: ${v}`),
    detailEntries.length ? `` : ``,
    `DESCRIPTION`,
    input.projectDescription,
    ``,
    `REFERRAL`,
    `Source: ${referral?.label ?? input.referralSource}`,
    input.referringName ? `Referred by: ${input.referringName}` : ``,
    input.referringCompany ? `Referring company: ${input.referringCompany}` : ``,
    input.referringEmail ? `Referring email: ${input.referringEmail}` : ``,
    input.referringPhone ? `Referring phone: ${input.referringPhone}` : ``,
    ``,
    `ATTACHMENTS: ${meta.fileCount}`,
    ``,
    `Open in the internal proposal view: ${meta.adminUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = layout(
    subject,
    `
    <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;">New proposal request</h1>
    <p style="margin:0 0 24px;font-size:13px;color:#6b7684;">Reference ${escapeHtml(opportunityNumber)}</p>

    <h2 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7684;">Contact</h2>
    ${row("Name", `${input.firstName} ${input.lastName}`)}
    ${row("Company", input.company)}
    ${row("Email", input.email)}
    ${row("Phone", input.phone || "not provided")}
    ${row("Preferred contact", input.preferredContact ?? "not specified")}

    <h2 style="margin:28px 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7684;">Project</h2>
    ${row("Address", `${input.projectAddress}, ${input.city}${input.state ? ", " + input.state : ""} ${input.zip}`.trim())}
    ${row("APN", input.apn || "not provided")}
    ${row("Property type", input.propertyType)}
    ${row("Approximate size", input.approximateSize)}
    ${row("Timeframe", input.timeframe ?? "not specified")}

    <h2 style="margin:28px 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7684;">Services requested</h2>
    ${row("Services", serviceNames(input.services))}
    ${detailEntries.map(([k, v]) => row(k, v)).join("")}

    <h2 style="margin:28px 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7684;">Description</h2>
    <p style="margin:0 0 10px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(input.projectDescription)}</p>

    <h2 style="margin:28px 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7684;">Referral</h2>
    ${row("Source", referral?.label ?? input.referralSource)}
    ${row("Referred by", input.referringName)}
    ${row("Referring company", input.referringCompany)}
    ${row("Referring email", input.referringEmail)}
    ${row("Referring phone", input.referringPhone)}

    ${row("Attachments", String(meta.fileCount))}

    <p style="margin:28px 0 0;"><a href="${escapeHtml(meta.adminUrl)}" style="display:inline-block;background:#0f3d5c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;">Open in internal proposal view</a></p>
  `,
  );

  return { subject, html, text };
}

export function inquiryNotification(input: InquiryInput) {
  const subject = `Website inquiry — ${input.subject || `${input.firstName} ${input.lastName}`.trim()}`;
  const text = [
    `NEW WEBSITE INQUIRY`,
    ``,
    `Name: ${input.firstName} ${input.lastName}`.trim(),
    `Company: ${input.company || "not provided"}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone || "not provided"}`,
    `Subject: ${input.subject || "not provided"}`,
    ``,
    `MESSAGE`,
    input.message,
    ``,
    `Submitted from: ${input.sourcePage || "unknown"}`,
  ].join("\n");

  const html = layout(
    subject,
    `
    <h1 style="margin:0 0 20px;font-size:22px;">New website inquiry</h1>
    ${row("Name", `${input.firstName} ${input.lastName}`.trim())}
    ${row("Company", input.company)}
    ${row("Email", input.email)}
    ${row("Phone", input.phone)}
    ${row("Subject", input.subject)}
    <h2 style="margin:28px 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7684;">Message</h2>
    <p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(input.message)}</p>
  `,
  );

  return { subject, html, text };
}

export function inquiryConfirmation(input: InquiryInput) {
  const subject = "We received your message — TDR Engineering";
  const text = `Hello ${input.firstName},\n\nThank you for contacting TDR Engineering. We have received your message and a member of our team will respond shortly.\n\nIf your message concerns a new project and you would like a proposal, you can also submit the details directly at ${site.url}/request-a-proposal.\n\nTDR Engineering\n${site.url}`;
  const html = layout(
    subject,
    `
    <h1 style="margin:0 0 16px;font-size:22px;">Thank you for contacting TDR</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${escapeHtml(input.firstName)}, we have received your message and a member of our team will respond shortly.</p>
    <p style="margin:0;font-size:15px;line-height:1.6;">If your message concerns a new project and you would like a proposal, you can submit the details directly on our <a href="${site.url}/request-a-proposal" style="color:#0f3d5c;">Request a Proposal</a> page.</p>
  `,
  );
  return { subject, html, text };
}
