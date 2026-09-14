"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { jobStatuses } from "@/content/job-statuses";
import { fileCategories } from "@/content/file-categories";
import {
  JOB_FILES_BUCKET,
  MAX_JOB_FILE_BYTES,
  DOWNLOAD_TTL_SECONDS,
  UPLOAD_TTL_SECONDS,
  jobFilePath,
  formatBytes,
} from "@/lib/storage/job-files";
import {
  signedUploadTarget,
  signedDownloadUrl,
  objectExists,
} from "@/lib/storage/providers";

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

// ------------------------------------------------------------- files ------

export type UploadTicket =
  | {
      ok: true;
      /** Which storage the browser should send to, and therefore how. */
      provider: "supabase" | "s3";
      bucket: string;
      path: string;
      uploadUrl: string;
      /** Supabase's signed-upload token. Null for cloud storage. */
      token: string | null;
      headers: Record<string, string>;
    }
  | { ok: false; error: string };

/**
 * Issues a short-lived signed upload URL. The browser PUTs the file straight
 * to storage with it — the bytes never come through here, which is the only
 * way files larger than Vercel's 4.5 MB request-body cap can move at all.
 *
 * Nothing is recorded yet. `recordUpload` writes the metadata row once the
 * bytes have actually landed.
 */
export async function requestUpload(input: {
  jobId: string;
  filename: string;
  size: number;
  contentType?: string;
}): Promise<UploadTicket> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized. Sign in again." };
  if (!input.jobId || !input.filename) return { ok: false, error: "Missing job or filename." };

  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "That file appears to be empty." };
  }
  if (input.size > MAX_JOB_FILE_BYTES) {
    return {
      ok: false,
      error: `That file is ${formatBytes(input.size)}. The limit is ${formatBytes(
        MAX_JOB_FILE_BYTES,
      )} per file — split it or put it on the NAS and link it instead.`,
    };
  }

  const path = jobFilePath(input.jobId, input.filename);

  // Where this goes is decided by `signedUploadTarget`, not here: cloud storage
  // when it is configured, Supabase otherwise. The browser is told which, so it
  // knows how to send the bytes.
  const target = await signedUploadTarget({
    bucket: JOB_FILES_BUCKET,
    path,
    expiresIn: UPLOAD_TTL_SECONDS,
    contentType: input.contentType ?? null,
  });

  if (!target.ok) return { ok: false, error: target.error };

  return {
    ok: true,
    provider: target.provider,
    bucket: target.bucket,
    path: target.path,
    uploadUrl: target.uploadUrl,
    token: target.token ?? null,
    headers: target.headers,
  };
}

/**
 * Records a file after its bytes have landed.
 *
 * Verifies the object actually exists first. Without that check this action
 * would happily record a file nobody can download, and the failure would only
 * surface later when a client clicked the link.
 */
export async function recordUpload(input: {
  jobId: string;
  provider: string;
  bucket: string;
  path: string;
  filename: string;
  contentType: string;
  size: number;
  category: string;
  clientVisible: boolean;
  label: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized. Sign in again." };

  if (!fileCategories.some((c) => c.value === input.category)) {
    return { ok: false, error: "Unknown file category." };
  }

  const supabase = await supabaseServer();

  // Confirm the bytes are really there before claiming the file exists.
  const provider = input.provider === "s3" ? "s3" : "supabase";
  const bucket = input.bucket || JOB_FILES_BUCKET;

  if (!(await objectExists({ provider, bucket, path: input.path }))) {
    return {
      ok: false,
      error: "The upload did not finish — nothing was saved. Try again.",
    };
  }

  const { error } = await supabase.from("files").insert({
    job_id: input.jobId,
    // Recorded per file, so this row keeps working after the provider changes.
    storage_provider: provider,
    storage_bucket: bucket,
    storage_path: input.path,
    original_filename: input.filename.slice(0, 200),
    content_type: input.contentType || null,
    byte_size: input.size,
    category: input.category,
    client_visible: input.clientVisible,
    label: input.label.trim().slice(0, 200) || null,
    uploaded_by: staff.id,
  });

  if (error) {
    return {
      ok: false,
      error: `The file uploaded but could not be recorded: ${error.message}`,
    };
  }

  revalidatePath(`/admin/jobs/${input.jobId}`);
  return { ok: true };
}

/** A short-lived link to download one file. */
export async function getDownloadUrl(
  fileId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { data: file } = await supabase
    .from("files")
    .select("storage_provider, storage_bucket, storage_path, original_filename")
    .eq("id", fileId)
    .is("archived_at", null)
    .maybeSingle();

  if (!file) return { ok: false, error: "File not found." };

  // The provider comes from the file's own row, so a file uploaded to Supabase
  // last month and one uploaded to cloud storage today both work.
  return signedDownloadUrl({
    provider: file.storage_provider as string,
    bucket: file.storage_bucket as string,
    path: file.storage_path as string,
    expiresIn: DOWNLOAD_TTL_SECONDS,
    downloadAs: file.original_filename as string,
  });
}

/** The portal gate. Flipping this is what exposes a file to a client. */
export async function setFileVisibility(input: {
  fileId: string;
  jobId: string;
  clientVisible: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("files")
    .update({ client_visible: input.clientVisible })
    .eq("id", input.fileId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/jobs/${input.jobId}`);
  return { ok: true };
}

/**
 * Removes a file from the job. Archived, not deleted: the row and the bytes
 * both stay, because "I deleted the wrong drawing" is a call TDR should be
 * able to recover from.
 */
export async function archiveFile(input: {
  fileId: string;
  jobId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("files")
    .update({ archived_at: new Date().toISOString(), client_visible: false })
    .eq("id", input.fileId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/jobs/${input.jobId}`);
  return { ok: true };
}
