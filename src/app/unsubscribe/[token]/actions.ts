"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/marketing/unsubscribe";

/**
 * Recording an opt-out from a public page.
 *
 * The address is taken from the TOKEN, never from the form. A posted address
 * would let anybody unsubscribe anybody — which is low-harm as attacks go, but
 * it is also completely avoidable: the token already attests to exactly one
 * address, and it is the only thing trusted here.
 *
 * Writes through `suppress_email()` with the service role, because the person
 * clicking is not signed in as anybody.
 */

export type UnsubscribeResult = { ok: true } | { ok: false; error: string };

export async function recordUnsubscribe(formData: FormData): Promise<UnsubscribeResult> {
  const token = String(formData.get("token") ?? "");
  const email = verifyUnsubscribeToken(token);

  if (!email) {
    return {
      ok: false,
      error: "This link is not valid. Please email us and we will remove you.",
    };
  }

  // `record_unsubscribe`, not `suppress_email`: it takes an address and
  // nothing else, so this route cannot record a bounce, a complaint or a note
  // even if it were tricked into trying. The staff function is a separate
  // entry point that `service_role` is not granted at all.
  const { data, error } = await supabaseAdmin().rpc("record_unsubscribe", {
    p_email: email,
  });

  if (error || data !== true) {
    return {
      ok: false,
      error: "Something went wrong. Please email us and we will remove you by hand.",
    };
  }

  return { ok: true };
}
