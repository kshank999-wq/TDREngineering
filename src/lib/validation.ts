import { z } from "zod";
import { requestableServices, propertyTypes, timeframes, contactMethods } from "@/content/services";
import { referralSourceCodes, professionalReferralCodes } from "@/content/referrals";

/**
 * Server-side validation for the public forms (spec §15: server-side
 * validation is required — the browser-side checks are a convenience only).
 */

const requestableCodes = requestableServices.map((s) => s.code) as [string, ...string[]];

const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (max: number, field: string) =>
  trimmed(max).min(1, `${field} is required`);

/** Loose on purpose: international and extension formats must not be rejected. */
const phoneSchema = trimmed(40).refine(
  (v) => v === "" || /[0-9]/.test(v),
  "Enter a valid phone number",
);

export const proposalSchema = z
  .object({
    // --- Contact information (spec §7) ---------------------------------
    firstName: requiredText(80, "First name"),
    lastName: requiredText(80, "Last name"),
    company: trimmed(160).optional().default(""),
    email: trimmed(180).email("Enter a valid email address"),
    phone: phoneSchema.optional().default(""),
    preferredContact: z.enum(contactMethods).optional(),

    // --- Project information -------------------------------------------
    projectAddress: requiredText(200, "Project address"),
    city: requiredText(100, "City"),
    state: trimmed(40).optional().default(""),
    zip: trimmed(20).optional().default(""),
    apn: trimmed(60).optional().default(""),
    propertyType: z.enum(propertyTypes),
    approximateSize: trimmed(80).optional().default(""),
    projectDescription: requiredText(5000, "Project description"),
    timeframe: z.enum(timeframes).optional(),

    // --- Service selection ----------------------------------------------
    services: z
      .array(z.enum(requestableCodes))
      .min(1, "Select at least one service")
      .max(requestableCodes.length),
    /** Answers to the conditional per-service questions. */
    serviceDetails: z.record(z.string(), z.string().max(2000)).optional().default({}),

    // --- Referral tracking (spec §8) -------------------------------------
    referralSource: z
      .string()
      .refine((v) => referralSourceCodes.has(v), "Select how you heard about TDR"),
    referringName: trimmed(160).optional().default(""),
    referringCompany: trimmed(160).optional().default(""),
    referringEmail: z
      .union([z.literal(""), z.string().trim().email("Enter a valid email address")])
      .optional()
      .default(""),
    referringPhone: phoneSchema.optional().default(""),
    referralOther: trimmed(200).optional().default(""),

    // --- Anti-spam (spec §9 step 2, §15) --------------------------------
    /** Honeypot. Real users never see or fill this. Deliberately NOT rejected
     *  here: a schema error would name the field in the response and tell a bot
     *  exactly which input to leave alone. `checkSpam` handles it instead, with
     *  a response that reveals nothing. */
    website: z.string().max(200).optional().default(""),
    /** Milliseconds the form was on screen before submit. */
    elapsedMs: z.coerce.number().int().nonnegative().optional().default(0),
    turnstileToken: z.string().optional().default(""),

    sourcePage: trimmed(300).optional().default(""),
  })
  .superRefine((value, ctx) => {
    // At least one way to reach the prospect back.
    if (!value.email && !value.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Provide a phone number or an email address",
      });
    }
    // A professional referral without a name is the case the spec explicitly
    // wants to stop losing (spec §8) — the relationship is the point.
    if (professionalReferralCodes.has(value.referralSource) && !value.referringName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referringName"],
        message: "Please tell us who referred you so we can thank them",
      });
    }
  });

export type ProposalInput = z.infer<typeof proposalSchema>;

export const inquirySchema = z.object({
  firstName: requiredText(80, "First name"),
  lastName: trimmed(80).optional().default(""),
  email: trimmed(180).email("Enter a valid email address"),
  phone: phoneSchema.optional().default(""),
  company: trimmed(160).optional().default(""),
  subject: trimmed(200).optional().default(""),
  message: requiredText(5000, "Message"),
  /** Honeypot — see the note on the proposal schema above. */
  website: z.string().max(200).optional().default(""),
  elapsedMs: z.coerce.number().int().nonnegative().optional().default(0),
  turnstileToken: z.string().optional().default(""),
  sourcePage: trimmed(300).optional().default(""),
});

export type InquiryInput = z.infer<typeof inquirySchema>;

/** Flattens a ZodError into `{ fieldName: "first message" }`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
