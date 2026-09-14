import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import {
  invoiceStatuses,
  invoiceStateLabel,
  invoiceStateTone,
  paymentMethods,
  paymentMethodLabel,
  money,
} from "@/content/billing";
import { statusClasses } from "@/content/statuses";
import {
  saveInvoice,
  addInvoiceLine,
  removeInvoiceLine,
  recordPayment,
  archivePayment,
} from "./actions";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * One invoice: its lines, its totals, and what has been received against it.
 *
 * Nothing on this page lets anyone type a total. The lines are the invoice;
 * subtotal, tax and total are derived from them by the database.
 */
export default async function InvoiceDetailPage({ params }: Params) {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");

  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: ledger } = await supabase
    .from("v_invoice_ledger")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!ledger) notFound();

  const [{ data: invoice }, { data: lines }, { data: payments }] = await Promise.all([
    supabase.from("invoices").select("notes, tax_rate, status").eq("id", id).maybeSingle(),
    supabase
      .from("invoice_lines")
      .select("id, description, quantity, unit_price, amount, sort_order")
      .eq("invoice_id", id)
      .order("sort_order"),
    supabase
      .from("payments")
      .select("id, amount, received_on, method, reference, notes, recorded_by")
      .eq("invoice_id", id)
      .is("archived_at", null)
      .order("received_on", { ascending: false }),
  ]);

  const balance = Number(ledger.balance ?? 0);
  const state = ledger.state as string;

  return (
    <div className="container-tdr py-10">
      <Link href="/admin/invoices" className="text-sm font-semibold text-brand-600">
        ← All invoices
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm font-semibold text-ink-500">
            {ledger.invoice_number as string}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-ink-900">
            {(ledger.company_name as string) || (ledger.contact_name as string) || "Invoice"}
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Issued{" "}
            {new Date(`${ledger.issue_date}T00:00:00`).toLocaleDateString(undefined, {
              dateStyle: "long",
            })}
            {ledger.job_number ? (
              <>
                {" · "}
                <Link
                  href={`/admin/jobs/${ledger.job_id}`}
                  className="text-brand-600 hover:underline"
                >
                  {ledger.job_number as string}
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <div className="text-right">
          <span
            className={`inline-flex rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ${
              statusClasses[invoiceStateTone(state)]
            }`}
          >
            {invoiceStateLabel(state)}
            {state === "overdue" && ledger.days_past_due
              ? ` · ${ledger.days_past_due} days`
              : ""}
          </span>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink-900">
            {balance > 0 ? money(balance) : money(0)}
          </p>
          <p className="text-xs text-ink-500">
            {balance > 0 ? "outstanding" : balance < 0 ? "overpaid" : "settled"}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Lines
            </h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="border-b border-ink-200 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Description</th>
                    <th className="py-2 pr-4 text-right font-semibold">Qty</th>
                    <th className="py-2 pr-4 text-right font-semibold">Unit</th>
                    <th className="py-2 pr-4 text-right font-semibold">Amount</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {(lines ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-ink-500">
                        No lines yet. Add one below.
                      </td>
                    </tr>
                  ) : (
                    (lines ?? []).map((line) => (
                      <tr key={line.id as string}>
                        <td className="py-3 pr-4 text-ink-900">{line.description as string}</td>
                        <td className="py-3 pr-4 text-right font-mono tabular-nums text-ink-600">
                          {Number(line.quantity)}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono tabular-nums text-ink-600">
                          {money(line.unit_price)}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono tabular-nums text-ink-900">
                          {money(line.amount)}
                        </td>
                        <td className="py-3 text-right">
                          <form action={removeInvoiceLine}>
                            <input type="hidden" name="id" value={id} />
                            <input type="hidden" name="line_id" value={line.id as string} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-ink-400 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t border-ink-200 font-mono tabular-nums">
                  <tr>
                    <td colSpan={3} className="py-2 pr-4 text-right text-xs uppercase tracking-wider text-ink-400">
                      Subtotal
                    </td>
                    <td className="py-2 pr-4 text-right text-ink-700">{money(ledger.subtotal)}</td>
                    <td />
                  </tr>
                  {Number(ledger.tax_amount) > 0 ? (
                    <tr>
                      <td colSpan={3} className="py-2 pr-4 text-right text-xs uppercase tracking-wider text-ink-400">
                        Tax ({(Number(ledger.tax_rate) * 100).toFixed(2)}%)
                      </td>
                      <td className="py-2 pr-4 text-right text-ink-700">{money(ledger.tax_amount)}</td>
                      <td />
                    </tr>
                  ) : null}
                  <tr className="text-base font-semibold">
                    <td colSpan={3} className="py-2 pr-4 text-right text-xs uppercase tracking-wider text-ink-500">
                      Total
                    </td>
                    <td className="py-2 pr-4 text-right text-ink-900">{money(ledger.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <form action={addInvoiceLine} className="mt-5 grid gap-3 border-t border-ink-100 pt-5 sm:grid-cols-[1fr_5rem_7rem_auto]">
              <input type="hidden" name="id" value={id} />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Description</span>
                <input name="description" required placeholder="Boundary survey"
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Qty</span>
                <input name="quantity" defaultValue="1" inputMode="decimal"
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Unit price</span>
                <input name="unit_price" placeholder="0.00" inputMode="decimal"
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
              </label>
              <button type="submit" className="self-end rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                Add line
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Payments received ({(payments ?? []).length})
            </h2>

            <form action={recordPayment} className="mt-4 grid gap-3 sm:grid-cols-[7rem_9rem_1fr_auto]">
              <input type="hidden" name="id" value={id} />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Amount</span>
                <input name="amount" required inputMode="decimal"
                  defaultValue={balance > 0 ? String(balance) : ""}
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Method</span>
                <select name="method"
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none">
                  {paymentMethods.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Reference</span>
                <input name="reference" placeholder="Cheque 10482"
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
              </label>
              <button type="submit" className="self-end rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
                Record
              </button>
            </form>

            <ul className="mt-5 divide-y divide-ink-100 border-t border-ink-100">
              {(payments ?? []).length === 0 ? (
                <li className="py-4 text-sm text-ink-500">Nothing received yet.</li>
              ) : (
                (payments ?? []).map((payment) => (
                  <li key={payment.id as string} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="font-mono text-sm font-semibold tabular-nums text-ink-900">
                        {money(payment.amount)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {new Date(`${payment.received_on}T00:00:00`).toLocaleDateString()} ·{" "}
                        {paymentMethodLabel(payment.method as string)}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </p>
                    </div>
                    <form action={archivePayment}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="payment_id" value={payment.id as string} />
                      <button type="submit" className="text-xs font-medium text-ink-400 hover:text-red-700">
                        Reverse
                      </button>
                    </form>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Invoice settings
            </h2>
            <form action={saveInvoice} className="mt-4 space-y-4">
              <input type="hidden" name="id" value={id} />

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Status</span>
                <select name="status" defaultValue={(invoice?.status as string) ?? "draft"}
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none">
                  {invoiceStatuses.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <span className="text-xs text-ink-500">
                  Paid, part paid and overdue are worked out from the payments and the due date.
                </span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Field name="issue_date" label="Issued" type="date" defaultValue={ledger.issue_date as string} />
                <Field name="due_date" label="Due" type="date" defaultValue={(ledger.due_date as string) ?? ""} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field name="terms" label="Terms" defaultValue={(ledger.terms as string) ?? ""} />
                <Field name="tax_percent" label="Tax %" inputMode="decimal"
                  defaultValue={((Number(invoice?.tax_rate ?? 0)) * 100).toFixed(2)} />
              </div>
              <Field name="po_number" label="Client PO" defaultValue={(ledger.po_number as string) ?? ""} />

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Notes on the invoice</span>
                <textarea name="notes" rows={3} defaultValue={(invoice?.notes as string) ?? ""}
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
              </label>

              <button type="submit" className="w-full rounded-md border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50">
                Save invoice
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Total" value={money(ledger.total)} />
              <Row label="Received" value={money(ledger.amount_paid)} />
              <Row label="Balance" value={money(ledger.balance)} strong />
              {ledger.exported_at ? (
                <Row label="Exported" value={new Date(ledger.exported_at as string).toLocaleDateString()} />
              ) : null}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-500">{label}</dt>
      <dd className={`font-mono tabular-nums ${strong ? "font-semibold text-ink-900" : "text-ink-700"}`}>
        {value}
      </dd>
    </div>
  );
}

function Field({
  name, label, defaultValue, type = "text", inputMode,
}: {
  name: string; label: string; defaultValue: string; type?: string;
  inputMode?: "decimal" | "text";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      <input type={type} name={name} inputMode={inputMode} defaultValue={defaultValue}
        className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
    </label>
  );
}
