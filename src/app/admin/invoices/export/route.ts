import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { toCsv, csvResponse } from "@/lib/csv";

/**
 * Accounting export.
 *
 * The accounting package receives records for tax and bookkeeping — it is not
 * where proposals or invoices originate. So this hands over what TDR has
 * already decided, in a shape QuickBooks can import, and nothing flows back.
 *
 * This route only reads. Marking rows as exported is a separate, deliberate
 * action taken *after* the import has been accepted — a GET that mutates would
 * fire on a link prefetch and silently mark a batch nobody downloaded.
 *
 * Reads go through the RLS-scoped session client, so an unauthenticated or
 * non-staff caller gets nothing regardless of what this route does.
 */

export const dynamic = "force-dynamic";

/**
 * QuickBooks Online's invoice import expects one row per line item with the
 * invoice header repeated on each. The leading-asterisk names are QuickBooks'
 * own required-column convention, not a typo.
 */
const INVOICE_COLUMNS = [
  "*InvoiceNo",
  "*Customer",
  "*InvoiceDate",
  "*DueDate",
  "Terms",
  "Memo",
  "ItemDescription",
  "ItemQuantity",
  "ItemRate",
  "*ItemAmount",
  "TaxRate",
  "Currency",
  "JobNumber",
  "PONumber",
] as const;

const PAYMENT_COLUMNS = [
  "PaymentDate",
  "InvoiceNo",
  "Customer",
  "Amount",
  "Method",
  "Reference",
  "JobNumber",
  "Memo",
] as const;

export async function GET(request: Request) {
  const staff = await getStaffUser();
  if (!staff) return new Response("Not authorized", { status: 401 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "payments" ? "payments" : "invoices";
  const pendingOnly = url.searchParams.get("pending") !== "false";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const supabase = await supabaseServer();

  if (type === "payments") {
    let query = supabase
      .from("payments")
      .select(
        `id, amount, received_on, method, reference, notes, exported_at,
         invoice:invoices!payments_invoice_id_fkey (
           invoice_number, company_id, contact_id,
           job:jobs!invoices_job_id_fkey ( job_number ),
           company:companies!invoices_company_id_fkey ( name ),
           contact:contacts!invoices_contact_id_fkey ( first_name, last_name )
         )`,
      )
      .is("archived_at", null)
      .order("received_on");

    if (pendingOnly) query = query.is("exported_at", null);
    if (from) query = query.gte("received_on", from);
    if (to) query = query.lte("received_on", to);

    const { data, error } = await query;
    if (error) return new Response(`Could not export: ${error.message}`, { status: 500 });

    const rows = (data ?? []).map((payment) => {
      const invoice = one(payment.invoice);
      const company = one(invoice?.company);
      const contact = one(invoice?.contact);
      const job = one(invoice?.job);
      return [
        payment.received_on,
        invoice?.invoice_number ?? "",
        customerName(company, contact),
        Number(payment.amount).toFixed(2),
        payment.method,
        payment.reference ?? "",
        job?.job_number ?? "",
        payment.notes ?? "",
      ];
    });

    return csvResponse(toCsv(PAYMENT_COLUMNS, rows), "tdr-payments");
  }

  // Invoices, one row per line.
  let query = supabase
    .from("invoices")
    .select(
      `id, invoice_number, issue_date, due_date, terms, notes, tax_rate, currency,
       po_number, status, exported_at,
       job:jobs!invoices_job_id_fkey ( job_number ),
       company:companies!invoices_company_id_fkey ( name ),
       contact:contacts!invoices_contact_id_fkey ( first_name, last_name ),
       lines:invoice_lines ( description, quantity, unit_price, amount, sort_order )`,
    )
    .is("archived_at", null)
    // A draft is not a document anyone should be posting to the books.
    .neq("status", "draft")
    .order("issue_date");

  if (pendingOnly) query = query.is("exported_at", null);
  if (from) query = query.gte("issue_date", from);
  if (to) query = query.lte("issue_date", to);

  const { data, error } = await query;
  if (error) return new Response(`Could not export: ${error.message}`, { status: 500 });

  const rows: unknown[][] = [];
  for (const invoice of data ?? []) {
    const company = one(invoice.company);
    const contact = one(invoice.contact);
    const job = one(invoice.job);
    const customer = customerName(company, contact);
    const lines = (Array.isArray(invoice.lines) ? invoice.lines : []).sort(
      (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
    );

    // An invoice with no lines still has to appear, or a reconciliation
    // against the ledger silently comes up short.
    const emitted = lines.length > 0 ? lines : [null];

    for (const line of emitted) {
      rows.push([
        invoice.invoice_number,
        customer,
        invoice.issue_date,
        invoice.due_date ?? "",
        invoice.terms ?? "",
        invoice.notes ?? "",
        line ? line.description : "(no line items)",
        line ? Number(line.quantity) : 0,
        line ? Number(line.unit_price).toFixed(2) : "0.00",
        line ? Number(line.amount).toFixed(2) : "0.00",
        (Number(invoice.tax_rate ?? 0) * 100).toFixed(4),
        invoice.currency ?? "USD",
        job?.job_number ?? "",
        invoice.po_number ?? "",
      ]);
    }
  }

  return csvResponse(toCsv(INVOICE_COLUMNS, rows), "tdr-invoices");
}

/** PostgREST types an embedded relation as an array even when at most one row
 *  can match. */
function one(value: unknown): Record<string, string> | null {
  if (!value) return null;
  const record = Array.isArray(value) ? value[0] : value;
  return (record as Record<string, string>) ?? null;
}

/** QuickBooks matches on a single customer name, so a company wins over the
 *  individual when both are present — that is who the invoice is addressed to. */
function customerName(
  company: Record<string, string> | null,
  contact: Record<string, string> | null,
): string {
  if (company?.name) return company.name;
  if (contact) return `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
  return "Unknown customer";
}
