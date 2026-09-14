"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { jobStatuses } from "@/content/job-statuses";

/**
 * Server actions for a job.
 *
 * Everything writes through the RLS-scoped session client, so the database
 * enforces staff-only access whether or not this code checks — and it checks
 * anyway, so a failure is a message rather than a policy violation.
 *
 * NOTE: this file carries `"use server"`, so it may export ONLY async
 * functions. `npm run check:actions` enforces that; a constant exported here
 * takes the whole route down at runtime and the build will not catch it.
 */

export async function updateJobStatus(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!id) throw new Error("Missing job id");
  if (!jobStatuses.some((item) => item.value === status)) throw new Error("Unknown status");

  const supabase = await supabaseServer();
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  // The trigger records the transition and stamps delivered_at / closed_at.
  revalidatePath(`/admin/jobs/${id}`);
  revalidatePath("/admin/jobs");
}

/** Dates, money and assignment — the fields that change as work progresses. */
export async function saveJobDetails(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing job id");

  const text = (name: string, max = 200) => {
    const value = String(formData.get(name) ?? "").trim();
    return value === "" ? null : value.slice(0, max);
  };

  const date = (name: string) => {
    const value = String(formData.get(name) ?? "").trim();
    // An empty date input posts "", which Postgres will not accept as a date.
    return value === "" ? null : value;
  };

  const amountRaw = String(formData.get("contract_amount") ?? "").replace(/[$,\s]/g, "");
  const amount = amountRaw === "" ? null : Number(amountRaw);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error("Contract amount must be a positive number");
  }

  const assigned = String(formData.get("assigned_to") ?? "");

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("jobs")
    .update({
      name: text("name") ?? "Untitled job",
      description: text("description", 5000),
      contract_amount: amount,
      purchase_order: text("purchase_order"),
      scheduled_start: date("scheduled_start"),
      field_complete: date("field_complete"),
      assigned_to: assigned === "" ? null : assigned,
      notes: text("notes", 5000),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/jobs/${id}`);
  revalidatePath("/admin/jobs");
}

export async function addJobNote(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("job_notes")
    .insert({ job_id: id, author_id: staff.id, body: body.slice(0, 5000) });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/jobs/${id}`);
}
