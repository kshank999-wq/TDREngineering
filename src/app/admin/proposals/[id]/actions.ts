"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

/**
 * Turns an accepted proposal into a job.
 *
 * The proposal is left exactly as it was. It is the record of what TDR quoted
 * and must stay true — the job is a new object that carries the work forward.
 *
 * Clicking twice cannot produce two jobs: a unique index on
 * `jobs.opportunity_id` refuses the second insert at the database, so the
 * guard holds even if this code is bypassed entirely.
 */
export async function convertToJob(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing opportunity id");

  const supabase = await supabaseServer();

  const { data: opportunity, error: readError } = await supabase
    .from("opportunities")
    .select(
      `id, opportunity_number, contact_id, company_id, property_id,
       project_description, status,
       property:properties!opportunities_property_id_fkey ( address_line1, city )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!opportunity) throw new Error("Proposal request not found");

  const { data: existing } = await supabase
    .from("jobs")
    .select("id")
    .eq("opportunity_id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (existing) {
    // Already converted — send them to the job rather than erroring.
    redirect(`/admin/jobs/${existing.id}`);
  }

  const property = Array.isArray(opportunity.property)
    ? opportunity.property[0]
    : opportunity.property;
  const site = (property as { address_line1?: string; city?: string } | null) ?? null;

  // A name someone can recognise on a board, from the site address where there
  // is one and the proposal number where there is not.
  const name =
    [site?.address_line1, site?.city].filter(Boolean).join(", ") ||
    `Job from ${opportunity.opportunity_number as string}`;

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      opportunity_id: opportunity.id,
      contact_id: opportunity.contact_id,
      company_id: opportunity.company_id,
      property_id: opportunity.property_id,
      name: name.slice(0, 200),
      description: opportunity.project_description,
      created_by: staff.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Mark the proposal won if it was not already. Spec §11 keeps
  // `project_number` on the opportunity so proposal search can reach the job.
  await supabase
    .from("opportunities")
    .update({
      status: "won",
      project_number: (await supabase.from("jobs").select("job_number").eq("id", job.id).single())
        .data?.job_number,
    })
    .eq("id", id);

  revalidatePath(`/admin/proposals/${id}`);
  revalidatePath("/admin/jobs");
  redirect(`/admin/jobs/${job.id}`);
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
