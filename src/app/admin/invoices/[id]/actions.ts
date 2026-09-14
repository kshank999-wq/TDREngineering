"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { invoiceStatuses, paymentMethods } from "@/content/billing";

/**
 * Invoice and payment actions.
 *
 * Totals are never written from here. A database trigger derives subtotal, tax
 * and total from the lines every time the lines change, so the number on the
 * invoice is always a fact about the invoice rather than something this code
 * calculated and hoped stayed in step.
 *
 * NOTE: `"use server"` — only async functions may be exported. `npm run
 * check:actions` enforces it.
 */

const num = (value: FormDataEntryValue | null, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const text = (value: FormDataEntryValue | null, max = 200) => {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed.slice(0, max);
};

/** Creates a draft invoice against a job and opens it. */
export async function createInvoiceForJob(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) throw new Error("Missing job id");

  const supabase = await supabaseServer();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, name, contact_id, company_id, contract_amount, purchase_order")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) throw new Error("Job not found");

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      job_id: job.id,
      contact_id: job.contact_id,
      company_id: job.company_id,
      po_number: job.purchase_order,
      due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      created_by: staff.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Seed a first line from the contract so the common case is one edit rather
  // than one creation plus one addition.
  if (job.contract_amount) {
    await supabase.from("invoice_lines").insert({
      invoice_id: invoice.id,
      description: job.name as string,
      quantity: 1,
      unit_price: job.contract_amount,
      sort_order: 1,
    });
  }

  revalidatePath(`/admin/jobs/${jobId}`);
  redirect(`/admin/invoices/${invoice.id}`);
}

export async function saveInvoice(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing invoice id");

  const status = String(formData.get("status") ?? "draft");
  if (!invoiceStatuses.some((s) => s.value === status)) throw new Error("Unknown status");

  // Stored as a fraction; entered as a percentage, because nobody thinks in
  // 0.0825.
  const taxPercent = num(formData.get("tax_percent"));
  if (taxPercent < 0 || taxPercent >= 100) throw new Error("Tax rate must be between 0 and 100");

  const supabase = await supabaseServer();

  const patch: Record<string, unknown> = {
    status,
    issue_date: text(formData.get("issue_date")) ?? new Date().toISOString().slice(0, 10),
    due_date: text(formData.get("due_date")),
    terms: text(formData.get("terms")),
    po_number: text(formData.get("po_number")),
    tax_rate: taxPercent / 100,
    notes: text(formData.get("notes"), 5000),
  };

  // Stamp the transitions the first time each happens, so the record of when
  // an invoice went out survives later edits.
  const { data: current } = await supabase
    .from("invoices")
    .select("status, sent_at, voided_at")
    .eq("id", id)
    .maybeSingle();

  if (status === "sent" && !current?.sent_at) patch.sent_at = new Date().toISOString();
  if (status === "void" && !current?.voided_at) patch.voided_at = new Date().toISOString();

  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

export async function addInvoiceLine(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  const description = text(formData.get("description"), 500);
  if (!id || !description) return;

  const supabase = await supabaseServer();
  const { count } = await supabase
    .from("invoice_lines")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", id);

  const { error } = await supabase.from("invoice_lines").insert({
    invoice_id: id,
    description,
    quantity: num(formData.get("quantity"), 1) || 1,
    unit_price: num(formData.get("unit_price")),
    sort_order: (count ?? 0) + 1,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/invoices/${id}`);
}

export async function removeInvoiceLine(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  const lineId = String(formData.get("line_id") ?? "");
  if (!id || !lineId) return;

  const supabase = await supabaseServer();
  const { error } = await supabase.from("invoice_lines").delete().eq("id", lineId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/invoices/${id}`);
}

/**
 * Records money received. Deliberately not restricted to the outstanding
 * balance: clients overpay, pay two invoices with one cheque, and pay twice by
 * mistake. Refusing the entry would not undo any of that — it would just mean
 * the books no longer match the bank.
 */
export async function recordPayment(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  const amount = num(formData.get("amount"));
  const method = String(formData.get("method") ?? "check");

  if (!id) throw new Error("Missing invoice id");
  if (!(amount > 0)) throw new Error("A payment must be greater than zero");
  if (!paymentMethods.some((m) => m.value === method)) throw new Error("Unknown payment method");

  const supabase = await supabaseServer();
  const { error } = await supabase.from("payments").insert({
    invoice_id: id,
    amount,
    method,
    received_on: text(formData.get("received_on")) ?? new Date().toISOString().slice(0, 10),
    reference: text(formData.get("reference")),
    notes: text(formData.get("notes"), 1000),
    recorded_by: staff.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

/** Archives a payment rather than deleting it — a reversal is a record too. */
export async function archivePayment(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const id = String(formData.get("id") ?? "");
  const paymentId = String(formData.get("payment_id") ?? "");
  if (!id || !paymentId) return;

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("payments")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", paymentId);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
}

/**
 * Marks everything currently pending as handed to accounting.
 *
 * Deliberately separate from the download, and deliberately taken *after* the
 * import is accepted. A GET that marked rows on download would fire on a link
 * prefetch and quietly mark a batch nobody imported — and there is no way to
 * tell afterwards which invoices those were.
 */
export async function markExported(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const kind = String(formData.get("kind") ?? "invoices");
  const stamp = new Date().toISOString();
  const batch = `${kind}-${stamp.slice(0, 19).replace(/[:T]/g, "")}`;

  const supabase = await supabaseServer();

  if (kind === "payments") {
    const { error } = await supabase
      .from("payments")
      .update({ exported_at: stamp, export_batch: batch })
      .is("exported_at", null)
      .is("archived_at", null);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("invoices")
      .update({ exported_at: stamp, export_batch: batch })
      .is("exported_at", null)
      .is("archived_at", null)
      .neq("status", "draft");
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin/invoices");
}
