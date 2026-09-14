"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  generateProposalToken,
  hashProposalToken,
  buildSnapshot,
  hashSnapshot,
} from "@/lib/proposals/signing";
import { DEFAULT_LINK_DAYS } from "@/content/esign";
import {
  PROPOSAL_DOCUMENTS_BUCKET,
  MAX_PROPOSAL_DOCUMENT_BYTES,
  PROPOSAL_DOCUMENT_TTL_SECONDS,
} from "@/lib/proposals/documents";
import { env } from "@/lib/env";
import { sanitizeFilename } from "@/lib/uploads";

/**
 * Staff actions for a proposal document.
 *
 * Everything here writes through the RLS-scoped session client, so the
 * database enforces staff-only access independently of these checks. The one
 * exception is storage, which needs the service role to mint signed URLs.
 *
 * The important rule this file serves: a sent proposal is frozen. The database
 * enforces that with a trigger, so an editing action that tries to change one
 * gets an error rather than quietly rewriting what somebody is being asked to
 * sign. These actions surface that as a sentence instead of a stack trace.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

// A sent proposal cannot be edited. The trigger says so too; this turns the
// database's message into something a person can act on.
function frozen(error: { message: string }): ActionResult {
  if (/already been sent|has been signed|cannot go from/i.test(error.message)) {
    return {
      ok: false,
      error:
        "This proposal has already gone out and cannot be changed. Withdraw it and issue a revision.",
    };
  }
  return { ok: false, error: error.message };
}

/** Creates a draft against an opportunity, seeded from what the client asked for. */
export async function createProposalFromOpportunity(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!opportunityId) throw new Error("Missing opportunity id");

  const supabase = await supabaseServer();
  const { data: opportunity, error: readError } = await supabase
    .from("opportunities")
    .select(
      `id, opportunity_number, contact_id, company_id, property_id, project_description,
       property:properties!opportunities_property_id_fkey ( address_line1, city )`,
    )
    .eq("id", opportunityId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!opportunity) throw new Error("Proposal request not found");

  const property = Array.isArray(opportunity.property)
    ? opportunity.property[0]
    : opportunity.property;
  const site = (property as { address_line1?: string; city?: string } | null) ?? null;
  const title =
    [site?.address_line1, site?.city].filter(Boolean).join(", ") ||
    `Proposal for ${opportunity.opportunity_number as string}`;

  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({
      opportunity_id: opportunity.id,
      contact_id: opportunity.contact_id,
      company_id: opportunity.company_id,
      property_id: opportunity.property_id,
      title: title.slice(0, 200),
      scope: opportunity.project_description,
      created_by: staff.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("proposal_events").insert({
    proposal_id: proposal.id,
    kind: "created",
    actor_user_id: staff.id,
  });

  redirect(`/admin/proposals/documents/${proposal.id}`);
}

export async function updateProposal(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing proposal id." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "A proposal needs a title." };

  const taxRateRaw = String(formData.get("tax_rate") ?? "").trim();
  // Entered as a percentage because that is how people say it; stored as a
  // fraction because that is how the arithmetic works.
  const taxRate = taxRateRaw ? Number(taxRateRaw) / 100 : 0;
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate >= 1) {
    return { ok: false, error: "Tax rate must be a percentage between 0 and 99." };
  }

  const validUntil = String(formData.get("valid_until") ?? "").trim();

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("proposals")
    .update({
      title: title.slice(0, 200),
      scope: String(formData.get("scope") ?? "").trim() || null,
      exclusions: String(formData.get("exclusions") ?? "").trim() || null,
      terms: String(formData.get("terms") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      valid_until: validUntil || null,
      tax_rate: taxRate,
    })
    .eq("id", id);

  if (error) return frozen(error);

  revalidatePath(`/admin/proposals/documents/${id}`);
  return { ok: true, message: "Saved." };
}

export async function addProposalLine(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const proposalId = String(formData.get("proposalId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  if (!proposalId || !description) {
    return { ok: false, error: "A line needs a description." };
  }

  const quantity = Number(String(formData.get("quantity") ?? "1"));
  const unitPrice = Number(String(formData.get("unit_price") ?? "0"));
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return { ok: false, error: "Quantity and price must be numbers." };
  }

  const supabase = await supabaseServer();
  const { count } = await supabase
    .from("proposal_lines")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", proposalId);

  const { error } = await supabase.from("proposal_lines").insert({
    proposal_id: proposalId,
    description: description.slice(0, 500),
    quantity,
    unit_price: unitPrice,
    sort_order: (count ?? 0) + 1,
  });

  if (error) return frozen(error);

  revalidatePath(`/admin/proposals/documents/${proposalId}`);
  return { ok: true };
}

export async function removeProposalLine(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const proposalId = String(formData.get("proposalId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  if (!proposalId || !lineId) return { ok: false, error: "Missing line." };

  const supabase = await supabaseServer();
  const { error } = await supabase.from("proposal_lines").delete().eq("id", lineId);
  if (error) return frozen(error);

  revalidatePath(`/admin/proposals/documents/${proposalId}`);
  return { ok: true };
}

/**
 * Sending: the moment the document stops being editable.
 *
 * Order matters. The snapshot and hash are written FIRST, in the same update
 * that flips the status — so there is no window in which a proposal is
 * reachable by a client but has no frozen record of what they were shown.
 *
 * This does not email anything. TDR's transactional email is not reliably
 * configured yet, and an invitation that silently fails to send is worse than
 * none, so this returns a link for staff to pass on however they already talk
 * to that client. Same decision as the portal invite, for the same reason.
 */
export async function sendProposal(formData: FormData): Promise<
  ActionResult & { link?: string }
> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing proposal id." };

  const sentTo = String(formData.get("sent_to") ?? "").trim().toLowerCase();
  const expiryDays = Number(String(formData.get("link_days") ?? DEFAULT_LINK_DAYS));

  const supabase = await supabaseServer();
  const { data: proposal, error: readError } = await supabase
    .from("proposals")
    .select(
      `id, proposal_number, title, scope, exclusions, terms, valid_until, status,
       currency, subtotal, tax_rate, tax_amount, total, document_file_id, content_hash,
       contact:contacts!proposals_contact_id_fkey ( first_name, last_name ),
       company:companies!proposals_company_id_fkey ( name ),
       property:properties!proposals_property_id_fkey ( address_line1, city, state ),
       document:files!proposals_document_file_id_fkey ( original_filename )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!proposal) return { ok: false, error: "Proposal not found." };

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const contact = one(proposal.contact) as { first_name?: string; last_name?: string } | null;
  const company = one(proposal.company) as { name?: string } | null;
  const site = one(proposal.property) as
    | { address_line1?: string; city?: string; state?: string }
    | null;
  const document = one(proposal.document) as { original_filename?: string } | null;

  const { data: lines } = await supabase
    .from("proposal_lines")
    .select("description, quantity, unit_price, amount")
    .eq("proposal_id", id)
    .order("sort_order");

  const hasLines = (lines?.length ?? 0) > 0;
  if (!hasLines && !proposal.document_file_id) {
    return {
      ok: false,
      error:
        "This proposal has no fee lines and no attached document. Add at least one before sending it.",
    };
  }

  const isResend = proposal.status === "sent";

  // Freezing the document is the point of this step, so it only happens once.
  // Re-sending an already-sent proposal issues a NEW LINK against the SAME
  // frozen record — the client must not be shown something different from
  // what the first link showed.
  let contentHash: string | null = proposal.content_hash as string | null;

  if (!isResend) {
    if (proposal.status !== "draft") {
      return { ok: false, error: "Only a draft or an already-sent proposal can be sent." };
    }

    const snapshot = buildSnapshot({
      proposalNumber: proposal.proposal_number as string,
      title: proposal.title as string,
      scope: (proposal.scope as string) ?? null,
      exclusions: (proposal.exclusions as string) ?? null,
      terms: (proposal.terms as string) ?? null,
      validUntil: (proposal.valid_until as string) ?? null,
      currency: proposal.currency as string,
      subtotal: proposal.subtotal as string,
      taxRate: proposal.tax_rate as string,
      taxAmount: proposal.tax_amount as string,
      total: proposal.total as string,
      addressedTo:
        [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || null,
      company: company?.name ?? null,
      property:
        [site?.address_line1, site?.city, site?.state].filter(Boolean).join(", ") || null,
      documentFilename: document?.original_filename ?? null,
      lines: (lines ?? []).map((l) => ({
        description: l.description as string,
        quantity: l.quantity as string,
        unit_price: l.unit_price as string,
        amount: l.amount as string,
      })),
    });

    contentHash = hashSnapshot(snapshot);

    const { error: sendError } = await supabase
      .from("proposals")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        snapshot,
        content_hash: contentHash,
      })
      .eq("id", id);

    if (sendError) return frozen(sendError);
  }

  // The link. Generated here, hashed, and never stored in the clear.
  const token = generateProposalToken();
  const expiresAt =
    Number.isFinite(expiryDays) && expiryDays > 0
      ? new Date(Date.now() + expiryDays * 86400_000).toISOString()
      : null;

  const { error: tokenError } = await supabase.from("proposal_access_tokens").insert({
    proposal_id: id,
    token_hash: hashProposalToken(token),
    sent_to: sentTo || null,
    expires_at: expiresAt,
    created_by: staff.id,
  });

  if (tokenError) return { ok: false, error: tokenError.message };

  await supabase.from("proposal_events").insert({
    proposal_id: id,
    kind: isResend ? "link_issued" : "sent",
    detail: sentTo || null,
    actor_user_id: staff.id,
  });

  revalidatePath(`/admin/proposals/documents/${id}`);
  return {
    ok: true,
    link: `${env.siteUrl.replace(/\/$/, "")}/proposal/${token}`,
    message: isResend
      ? "New link issued. The earlier links still work until you revoke them."
      : "Proposal sent and locked. Copy the link — it is shown once.",
  };
}

/** Kills one link without touching the proposal. */
export async function revokeProposalLink(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const proposalId = String(formData.get("proposalId") ?? "");
  const tokenId = String(formData.get("tokenId") ?? "");
  if (!proposalId || !tokenId) return { ok: false, error: "Missing link." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("proposal_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId);

  if (error) return { ok: false, error: error.message };

  await supabase.from("proposal_events").insert({
    proposal_id: proposalId,
    token_id: tokenId,
    kind: "link_revoked",
    actor_user_id: staff.id,
  });

  revalidatePath(`/admin/proposals/documents/${proposalId}`);
  return { ok: true, message: "Link revoked. It stops working immediately." };
}

/**
 * Withdrawing. Terminal by design — the database refuses to move a withdrawn
 * proposal anywhere else, so revising means issuing a new one. That is also
 * how it works on paper, and it keeps the record of what was offered when.
 */
export async function withdrawProposal(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing proposal id." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("proposals")
    .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return frozen(error);

  // Every live link dies with it. A withdrawn proposal is unreachable anyway —
  // `proposal_for_signing` excludes the status — but leaving working links
  // pointing at a pulled document is untidy in a way that matters here.
  await supabase
    .from("proposal_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("proposal_id", id)
    .is("revoked_at", null);

  await supabase.from("proposal_events").insert({
    proposal_id: id,
    kind: "withdrawn",
    actor_user_id: staff.id,
  });

  revalidatePath(`/admin/proposals/documents/${id}`);
  return { ok: true, message: "Withdrawn. Its links no longer work." };
}

/** Staff may add to the trail but never amend it — see the RLS in 0010. */
export async function addProposalTrailNote(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const id = String(formData.get("id") ?? "");
  const detail = String(formData.get("detail") ?? "").trim();
  if (!id || !detail) return { ok: false, error: "Nothing to record." };

  const supabase = await supabaseServer();
  const { error } = await supabase.from("proposal_events").insert({
    proposal_id: id,
    kind: "note",
    detail: detail.slice(0, 1000),
    actor_user_id: staff.id,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/proposals/documents/${id}`);
  return { ok: true };
}

/**
 * Attaching TDR's own proposal PDF.
 *
 * Direct to storage, like job files: Vercel caps a serverless request body at
 * 4.5 MB, so anything that streams the file through a server action breaks on
 * a document with drawings in it.
 */
export async function createProposalDocumentUploadUrl(input: {
  proposalId: string;
  filename: string;
  contentType: string | null;
  byteSize: number;
}): Promise<
  { ok: true; uploadUrl: string; token: string; path: string } | { ok: false; error: string }
> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, status")
    .eq("id", input.proposalId)
    .maybeSingle();

  if (!proposal) return { ok: false, error: "Proposal not found." };
  if (proposal.status !== "draft") {
    return {
      ok: false,
      error: "This proposal has already gone out. Its document cannot be changed.",
    };
  }
  if (input.byteSize > MAX_PROPOSAL_DOCUMENT_BYTES) {
    return { ok: false, error: "That file is larger than 100 MB." };
  }

  const safe = sanitizeFilename(input.filename) || "proposal.pdf";
  const path = `proposals/${input.proposalId}/${Date.now()}-${safe}`;

  const { data, error } = await supabaseAdmin()
    .storage.from(PROPOSAL_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not start the upload." };
  }
  return { ok: true, uploadUrl: data.signedUrl, token: data.token, path };
}

export async function attachProposalDocument(input: {
  proposalId: string;
  path: string;
  filename: string;
  contentType: string | null;
  byteSize: number;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { data: file, error: fileError } = await supabase
    .from("files")
    .insert({
      proposal_id: input.proposalId,
      storage_bucket: PROPOSAL_DOCUMENTS_BUCKET,
      storage_path: input.path,
      original_filename: input.filename.slice(0, 255),
      content_type: input.contentType,
      byte_size: input.byteSize,
      uploaded_by: staff.id,
    })
    .select("id")
    .single();

  if (fileError) return { ok: false, error: fileError.message };

  const { error } = await supabase
    .from("proposals")
    .update({ document_file_id: file.id })
    .eq("id", input.proposalId);

  if (error) return frozen(error);

  revalidatePath(`/admin/proposals/documents/${input.proposalId}`);
  return { ok: true, message: "Document attached." };
}

/** Staff preview of the attached PDF. */
export async function getProposalDocumentUrl(
  proposalId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("proposals")
    .select("document:files!proposals_document_file_id_fkey ( storage_bucket, storage_path )")
    .eq("id", proposalId)
    .maybeSingle();

  const doc = Array.isArray(data?.document) ? data?.document[0] : data?.document;
  const file = (doc as { storage_bucket?: string; storage_path?: string } | null) ?? null;
  if (!file?.storage_bucket || !file?.storage_path) {
    return { ok: false, error: "No document attached." };
  }

  const { data: signed, error } = await supabaseAdmin()
    .storage.from(file.storage_bucket)
    .createSignedUrl(file.storage_path, PROPOSAL_DOCUMENT_TTL_SECONDS);

  if (error || !signed) {
    return { ok: false, error: error?.message ?? "Could not open that document." };
  }
  return { ok: true, url: signed.signedUrl };
}
