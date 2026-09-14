"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Granting and revoking client portal access.
 *
 * Creating a login requires the Supabase auth admin API, which needs the
 * service role — so these are the one place in the admin that reaches past
 * RLS. Every one of them checks `getStaffUser()` first, and the grant row
 * itself is written through the RLS-scoped client so the database still has
 * the final say on who may create one.
 *
 * INVITES ARE A LINK, NOT AN EMAIL
 *
 * TDR's transactional email is not reliably configured yet, and an invitation
 * that silently fails to send is worse than no invitation — the client waits,
 * nobody knows. So this returns a link for staff to pass on however they
 * already talk to that client. When email is working this can send instead.
 */

export type GrantResult =
  | { ok: true; inviteLink: string | null; message: string }
  | { ok: false; error: string };

export async function grantPortalAccess(input: {
  contactId: string;
  email: string;
  companyAccess: boolean;
}): Promise<GrantResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "A valid email address is required to create a login." };
  }

  const supabase = await supabaseServer();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .eq("id", input.contactId)
    .maybeSingle();

  if (!contact) return { ok: false, error: "Client not found." };

  const admin = supabaseAdmin();
  const fullName = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();

  // Create the auth user, or reuse the one that already exists for this email.
  let userId: string | null = null;
  let inviteLink: string | null = null;

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (created.data?.user) {
    userId = created.data.user.id;
  } else {
    // Already registered — find them rather than failing. Somebody who is
    // already a client on another contact record should not be blocked.
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!existing) {
      return {
        ok: false,
        error: created.error?.message ?? "Could not create a login for that address.",
      };
    }
    userId = existing.id;
  }

  // The app_users row is what the role model reads. Written with the service
  // role because a client has no row of their own to update yet.
  const { error: accountError } = await admin.from("app_users").upsert(
    { id: userId, email, full_name: fullName || null, role: "client", is_active: true },
    { onConflict: "id" },
  );
  if (accountError) return { ok: false, error: `Could not set up the account: ${accountError.message}` };

  const { error: grantError } = await supabase.from("client_portal_access").upsert(
    {
      user_id: userId,
      contact_id: contact.id,
      company_access: input.companyAccess,
      is_active: true,
      invited_by: staff.id,
    },
    { onConflict: "user_id" },
  );
  if (grantError) return { ok: false, error: `Could not grant access: ${grantError.message}` };

  // A link they can use to set their own password. Nothing is emailed.
  const { data: link } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  inviteLink = link?.properties?.action_link ?? null;

  revalidatePath(`/admin/clients/contact/${contact.id}`);
  return {
    ok: true,
    inviteLink,
    message: inviteLink
      ? "Access granted. Send this link so they can set a password — it is the only time it is shown."
      : "Access granted, but a sign-in link could not be generated. They can use the portal's forgotten-password flow.",
  };
}

export async function setPortalCompanyAccess(input: {
  userId: string;
  contactId: string;
  companyAccess: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("client_portal_access")
    .update({ company_access: input.companyAccess })
    .eq("user_id", input.userId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/clients/contact/${input.contactId}`);
  return { ok: true };
}

/**
 * Switches access off. Immediate: `is_active` is checked by
 * `client_can_see_job()` on every query, so the next thing they click returns
 * nothing. The row is kept so it is clear who had access and when.
 */
export async function setPortalActive(input: {
  userId: string;
  contactId: string;
  isActive: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("client_portal_access")
    .update({ is_active: input.isActive })
    .eq("user_id", input.userId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/clients/contact/${input.contactId}`);
  return { ok: true };
}
