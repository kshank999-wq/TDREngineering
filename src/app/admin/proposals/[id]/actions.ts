"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { opportunityStatuses } from "@/content/statuses";

/**
 * Server actions for the internal proposal view (spec §10).
 *
 * Both actions write through the RLS-scoped session client rather than the
 * service role, so the database enforces staff-only access independently of
 * this code.
 */

export async function updateStatus(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!id) throw new Error("Missing opportunity id");
  if (!opportunityStatuses.some((item) => item.value === status)) {
    throw new Error("Unknown status");
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.from("opportunities").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  // The status-change trigger records the transition in
  // opportunity_status_history automatically.
  revalidatePath(`/admin/proposals/${id}`);
  revalidatePath("/admin/proposals");
}

export async function addNote(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!id || !body) return;

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("opportunity_notes")
    .insert({ opportunity_id: id, author_id: staff.id, body: body.slice(0, 5000) });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/proposals/${id}`);
}
