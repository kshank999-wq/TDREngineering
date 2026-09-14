import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashProposalToken } from "@/lib/proposals/signing";

/**
 * Reading a proposal from a signing link.
 *
 * This is the one place in the application where the service role is used to
 * serve a completely anonymous visitor, so the shape of it matters:
 *
 *   1. The raw token from the URL is hashed HERE. It never reaches the
 *      database, so it cannot appear in a query log.
 *   2. The database function does the authorization — expiry, revocation,
 *      status — and chooses the columns. This code never selects from
 *      `proposals` directly, so there is no `select *` that could start
 *      returning `notes` because somebody added a column.
 *   3. Nothing is granted to `anon` at any point. A visitor cannot reach the
 *      database at all; they reach this route, which reaches the database.
 *
 * The functions themselves are granted to `service_role` alone — not even a
 * signed-in staff member may call them, because staff have no business signing
 * on a client's behalf.
 */

export type SigningLine = {
  description: string;
  quantity: string;
  unit_price: string;
  amount: string;
};

export type SigningProposal = {
  token_id: string;
  proposal_id: string;
  proposal_number: string;
  title: string;
  scope: string | null;
  exclusions: string | null;
  terms: string | null;
  status: "sent" | "accepted" | "declined";
  valid_until: string | null;
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total: string;
  currency: string;
  content_hash: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  company_name: string | null;
  contact_name: string | null;
  property_address: string | null;
  document_file_id: string | null;
  is_expired: boolean;
  lines: SigningLine[];
  signed_name: string | null;
  signed_at: string | null;
};

export async function readProposalByToken(token: string): Promise<SigningProposal | null> {
  if (!token || token.length < 20) return null;

  const { data, error } = await supabaseAdmin().rpc("proposal_for_signing", {
    p_token_hash: hashProposalToken(token),
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as SigningProposal;
}

/** Recording that the link was opened. Failure here must never block the page. */
export async function recordView(
  token: string,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  try {
    await supabaseAdmin().rpc("record_proposal_view", {
      p_token_hash: hashProposalToken(token),
      p_ip: ip,
      p_user_agent: userAgent?.slice(0, 500) ?? null,
    });
  } catch {
    // The audit trail is evidence, not a gate. A client who cannot open their
    // proposal because a logging write failed is a worse outcome than a
    // missing view entry, and the acceptance itself records its own event.
  }
}
