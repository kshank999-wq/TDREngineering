import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { referralSourceByCode } from "@/content/referrals";
import { serviceByCode } from "@/content/services";
import type { ProposalInput } from "@/lib/validation";

/**
 * Proposal submission workflow (spec §9).
 *
 *   3. Create or associate contact
 *   4. Create or associate company
 *   5. Create/associate property
 *   6. Associate referral source
 *   7. Create opportunity/proposal-request record
 *   8. Store attachment metadata
 *
 * The order below runs company → contact → property → opportunity → services →
 * referral, because a contact references its company and an opportunity
 * references all three.
 *
 * Design rule from spec §8: Client, Property and Referral Source are separate
 * objects. Smith Architecture referring Jane Doe for 123 Main Street creates
 * two contacts (Jane, the architect), one or two companies, one property and
 * one opportunity — related but distinct.
 */

const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeKey = (value: string) => normalize(value).toLowerCase();

export type IntakeResult = {
  opportunityId: string;
  opportunityNumber: string;
  contactId: string | null;
  companyId: string | null;
  propertyId: string | null;
};

export async function findOrCreateCompany(
  db: SupabaseClient,
  name: string,
  companyType = "other",
): Promise<string | null> {
  const clean = normalize(name);
  if (!clean) return null;

  const { data: existing } = await db
    .from("companies")
    .select("id")
    .ilike("name", clean)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data, error } = await db
    .from("companies")
    .insert({ name: clean, company_type: companyType })
    .select("id")
    .single();

  if (error) {
    // Lost a race against a concurrent submission with the same company name.
    // The unique index is the authority; re-read rather than fail the intake.
    const { data: raced } = await db
      .from("companies")
      .select("id")
      .ilike("name", clean)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (raced) return raced.id as string;
    throw error;
  }
  return data.id as string;
}

export async function findOrCreateContact(
  db: SupabaseClient,
  input: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    companyId?: string | null;
    preferredContact?: string | null;
    isProfessional?: boolean;
  },
): Promise<string | null> {
  const firstName = normalize(input.firstName);
  const lastName = normalize(input.lastName);
  if (!firstName && !lastName) return null;

  const email = input.email ? normalizeKey(input.email) : "";

  if (email) {
    const { data: existing } = await db
      .from("contacts")
      .select("id, company_id, phone")
      .eq("email", email)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Fill in gaps on the existing record without overwriting known-good
      // data — a returning client should enrich their record, not reset it.
      const patch: Record<string, unknown> = {};
      if (!existing.company_id && input.companyId) patch.company_id = input.companyId;
      if (!existing.phone && input.phone) patch.phone = normalize(input.phone);
      if (input.isProfessional) patch.is_professional = true;
      if (Object.keys(patch).length > 0) {
        await db.from("contacts").update(patch).eq("id", existing.id);
      }
      return existing.id as string;
    }
  }

  const { data, error } = await db
    .from("contacts")
    .insert({
      first_name: firstName || lastName,
      last_name: lastName || firstName,
      email: email || null,
      phone: input.phone ? normalize(input.phone) : null,
      company_id: input.companyId ?? null,
      preferred_contact: input.preferredContact
        ? input.preferredContact.toLowerCase()
        : null,
      is_professional: input.isProfessional ?? false,
    })
    .select("id")
    .single();

  if (error) {
    if (email) {
      const { data: raced } = await db
        .from("contacts")
        .select("id")
        .eq("email", email)
        .is("archived_at", null)
        .limit(1)
        .maybeSingle();
      if (raced) return raced.id as string;
    }
    throw error;
  }
  return data.id as string;
}

export async function findOrCreateProperty(
  db: SupabaseClient,
  input: {
    addressLine1: string;
    city: string;
    state?: string;
    postalCode?: string;
    apn?: string;
    propertyType?: string;
  },
): Promise<string | null> {
  const address = normalize(input.addressLine1);
  if (!address) return null;
  const city = normalize(input.city);
  const apn = input.apn ? normalize(input.apn) : "";

  // APN is the strongest identifier when the prospect supplied one.
  if (apn) {
    const { data: byApn } = await db
      .from("properties")
      .select("id")
      .ilike("apn", apn)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (byApn) return byApn.id as string;
  }

  const { data: byAddress } = await db
    .from("properties")
    .select("id, apn")
    .ilike("address_line1", address)
    .ilike("city", city || "%")
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  if (byAddress) {
    if (apn && !byAddress.apn) {
      await db.from("properties").update({ apn }).eq("id", byAddress.id);
    }
    return byAddress.id as string;
  }

  const { data, error } = await db
    .from("properties")
    .insert({
      address_line1: address,
      city: city || null,
      state: input.state ? normalize(input.state) : null,
      postal_code: input.postalCode ? normalize(input.postalCode) : null,
      apn: apn || null,
      property_type: input.propertyType ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

/**
 * Runs the full proposal intake. Everything is written with the service-role
 * client, which bypasses RLS — the caller must have already validated input
 * and passed the spam checks.
 */
export async function createProposalRecord(
  input: ProposalInput,
  meta: { ipHash: string; userAgent: string; sourcePage: string },
): Promise<IntakeResult> {
  const db = supabaseAdmin();

  // 4. Company (the prospect's own company, when they gave one).
  const companyId = input.company
    ? await findOrCreateCompany(db, input.company, "other")
    : null;

  // 3. Contact.
  const contactId = await findOrCreateContact(db, {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    companyId,
    preferredContact: input.preferredContact ?? null,
  });

  // 5. Property.
  const propertyId = await findOrCreateProperty(db, {
    addressLine1: input.projectAddress,
    city: input.city,
    state: input.state,
    postalCode: input.zip,
    apn: input.apn,
    propertyType: input.propertyType,
  });

  // 7. Opportunity — the source of truth for this request (spec §9).
  const { data: opportunity, error: opportunityError } = await db
    .from("opportunities")
    .insert({
      contact_id: contactId,
      company_id: companyId,
      property_id: propertyId,
      status: "new",
      project_description: input.projectDescription,
      requested_timeframe: input.timeframe ?? null,
      approximate_size: input.approximateSize || null,
      service_details: input.serviceDetails ?? {},
      source: "website",
      source_page: meta.sourcePage || null,
      submitted_ip_hash: meta.ipHash,
      submitted_user_agent: meta.userAgent.slice(0, 500),
    })
    .select("id, opportunity_number")
    .single();

  if (opportunityError) throw opportunityError;

  const opportunityId = opportunity.id as string;

  // Requested services. Resolve codes to service ids in one round trip.
  if (input.services.length > 0) {
    const { data: serviceRows } = await db
      .from("services")
      .select("id, code")
      .in("code", input.services);

    const rows = (serviceRows ?? []).map((row) => ({
      opportunity_id: opportunityId,
      service_id: row.id as string,
      details: pickServiceDetails(row.code as string, input.serviceDetails ?? {}),
    }));

    if (rows.length > 0) {
      const { error } = await db.from("opportunity_services").insert(rows);
      if (error) throw error;
    }
  }

  // 6. Referral source — as a relationship, not a text field (spec §8).
  await createReferral(db, opportunityId, input);

  return {
    opportunityId,
    opportunityNumber: opportunity.opportunity_number as string,
    contactId,
    companyId,
    propertyId,
  };
}

/** Splits the flat serviceDetails map into the answers owned by one service. */
function pickServiceDetails(
  code: string,
  details: Record<string, string>,
): Record<string, string> {
  const service = serviceByCode(code);
  if (!service?.questions) return {};
  const out: Record<string, string> = {};
  for (const question of service.questions) {
    const value = details[question.name];
    if (value && value.trim()) out[question.label] = value.trim();
  }
  return out;
}

async function createReferral(
  db: SupabaseClient,
  opportunityId: string,
  input: ProposalInput,
): Promise<void> {
  const source = referralSourceByCode(input.referralSource);
  if (!source) return;

  let referringContactId: string | null = null;
  let referringCompanyId: string | null = null;

  if (source.professional) {
    // Associate with an existing company/contact where possible so TDR does
    // not accumulate a duplicate record for every project the same architect
    // sends over (spec §8).
    if (input.referringCompany) {
      referringCompanyId = await findOrCreateCompany(
        db,
        input.referringCompany,
        source.companyType ?? "other",
      );
    }
    if (input.referringName) {
      const [first, ...rest] = normalize(input.referringName).split(" ");
      referringContactId = await findOrCreateContact(db, {
        firstName: first,
        lastName: rest.join(" ") || first,
        email: input.referringEmail || undefined,
        phone: input.referringPhone || undefined,
        companyId: referringCompanyId,
        isProfessional: true,
      });
    }
  }

  const { error } = await db.from("referrals").insert({
    opportunity_id: opportunityId,
    source_code: input.referralSource,
    referring_contact_id: referringContactId,
    referring_company_id: referringCompanyId,
    // The raw values are preserved even after matching so a wrong match can
    // always be audited and corrected later.
    raw_name: input.referringName || null,
    raw_company: input.referringCompany || null,
    raw_email: input.referringEmail || null,
    raw_phone: input.referringPhone || null,
    notes: input.referralOther || null,
  });

  if (error) throw error;
}

/** 8. Store attachment metadata after the bytes land in Storage. */
export async function recordFileMetadata(
  opportunityId: string,
  files: {
    bucket: string;
    path: string;
    originalFilename: string;
    contentType: string | null;
    byteSize: number;
    checksum: string | null;
  }[],
): Promise<void> {
  if (files.length === 0) return;
  const db = supabaseAdmin();
  const { error } = await db.from("files").insert(
    files.map((file) => ({
      opportunity_id: opportunityId,
      storage_provider: "supabase",
      storage_bucket: file.bucket,
      storage_path: file.path,
      original_filename: file.originalFilename,
      content_type: file.contentType,
      byte_size: file.byteSize,
      checksum_sha256: file.checksum,
    })),
  );
  if (error) throw error;
}
