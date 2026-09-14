"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashProposalToken, clientIp } from "@/lib/proposals/signing";
import { consentRecord } from "@/content/esign";

/**
 * Accepting and declining, from a public page.
 *
 * The signer is not logged in as anybody, so every guard lives in the database
 * function these call: the token must be live, the proposal must be open, it
 * must not have expired, and there must not already be a signature. All of it
 * happens in one transaction, so there is no state where a client has signed
 * and the proposal does not say so.
 *
 * WHAT THE CLIENT SENDS IS NOT TRUSTED FOR ANYTHING THAT MATTERS
 *
 * The form carries a name, an email and two checkboxes. None of it decides
 * whether the signature is valid — the token does. The consent text in
 * particular is taken from the server's own content file rather than from the
 * form, so a doctored post cannot record that somebody agreed to wording TDR
 * never showed them.
 */

export type SignResult =
  | { ok: true; message: string; proposalNumber: string | null }
  | { ok: false; error: string };

export async function acceptProposal(formData: FormData): Promise<SignResult> {
  const token = String(formData.get("token") ?? "");
  const typedName = String(formData.get("typed_name") ?? "").trim();
  const email = String(formData.get("signer_email") ?? "").trim();
  const title = String(formData.get("signer_title") ?? "").trim();

  // Both boxes are required by the page, and checked again here: a form post
  // does not have to come from that page.
  const intent = formData.get("intent") === "on" || formData.get("intent") === "true";
  const consent = formData.get("consent") === "on" || formData.get("consent") === "true";

  if (!token) return { ok: false, error: "This link is no longer valid." };
  if (!typedName) return { ok: false, error: "Please type your full name to sign." };
  if (!intent || !consent) {
    return {
      ok: false,
      error: "Please tick both boxes to confirm you intend to sign electronically.",
    };
  }

  const head = await headers();
  const { data, error } = await supabaseAdmin().rpc("accept_proposal", {
    p_token_hash: hashProposalToken(token),
    p_typed_name: typedName.slice(0, 200),
    p_email: email.slice(0, 320) || null,
    p_title: title.slice(0, 200) || null,
    // From the server's content file, never from the form.
    p_consent_text: consentRecord(),
    p_ip: clientIp(head),
    p_user_agent: head.get("user-agent")?.slice(0, 500) ?? null,
  });

  if (error) {
    return {
      ok: false,
      error: "Something went wrong recording your acceptance. Please contact TDR Engineering.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    return { ok: false, error: row?.message ?? "This link is no longer valid." };
  }

  revalidatePath(`/proposal/${token}`);
  return {
    ok: true,
    message: "Accepted. Thank you — TDR Engineering has been notified.",
    proposalNumber: row.proposal_number ?? null,
  };
}

export async function declineProposal(formData: FormData): Promise<SignResult> {
  const token = String(formData.get("token") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!token) return { ok: false, error: "This link is no longer valid." };

  const head = await headers();
  const { data, error } = await supabaseAdmin().rpc("decline_proposal", {
    p_token_hash: hashProposalToken(token),
    p_reason: reason.slice(0, 1000) || null,
    p_ip: clientIp(head),
    p_user_agent: head.get("user-agent")?.slice(0, 500) ?? null,
  });

  if (error) {
    return {
      ok: false,
      error: "Something went wrong. Please contact TDR Engineering.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    return { ok: false, error: row?.message ?? "This link is no longer valid." };
  }

  revalidatePath(`/proposal/${token}`);
  return { ok: true, message: "Recorded. Thank you for letting us know.", proposalNumber: null };
}
