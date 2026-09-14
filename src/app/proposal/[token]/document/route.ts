import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashProposalToken } from "@/lib/proposals/signing";
import { PROPOSAL_DOCUMENT_TTL_SECONDS } from "@/lib/proposals/documents";

/**
 * Downloading the attached proposal PDF from a signing link.
 *
 * Order is the security property, exactly as in the client portal:
 *
 *   1. The database is asked, through the token, where the file lives.
 *      `proposal_document_for_signing()` applies the same checks the page does
 *      — live token, not revoked, not expired, not a draft or withdrawn.
 *   2. Only then does the service role mint a signed URL.
 *
 * So the storage client is never reached with a path the database has not
 * already released. A visitor cannot ask for a file; they can only ask for
 * "the document on the proposal this token opens".
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("proposal_document_for_signing", {
    p_token_hash: hashProposalToken(token),
  });

  const file = Array.isArray(data) ? data[0] : data;
  if (error || !file?.storage_bucket || !file?.storage_path) {
    // One answer for every failure — no document, dead token, withdrawn
    // proposal. Distinguishing them tells a stranger what they have found.
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(file.storage_bucket)
    .createSignedUrl(file.storage_path, PROPOSAL_DOCUMENT_TTL_SECONDS, {
      download: file.original_filename ?? "proposal.pdf",
    });

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  // Redirect rather than proxy: the bytes never pass through the function, so
  // a large document is not bounded by the serverless response limit.
  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
