# Invoices and payments

What has been billed, what has been received, and what is still owed — plus
the export that hands it all to accounting.

---

## Tracking, not processing

Recording that a cheque arrived is a table. Taking a card is Stripe, PCI scope,
and a different kind of commitment entirely.

Nothing here touches card data. `payments` records what was received; it does
not cause it.

## Three rules the schema enforces

### This system owns invoice numbering

Accounting software receives records for tax and bookkeeping. It does not
originate them. So the number is assigned here (`INV-2026-0001`), `exported_at`
records when a row was handed over, and an invoice is a complete invoice with
no accounting integration configured at all.

### Totals are derived, never typed

A line's `amount` is a generated column. A trigger recalculates the invoice's
subtotal, tax and total from its lines every time the lines change, and again
if the tax rate changes.

Nothing in the interface lets anyone type a total. An invoice whose total
disagrees with its own lines is worse than useless, and there is no path
through the application that can produce one.

### Paid is derived, not declared

`invoices.status` holds **intent only**: draft, sent, void.

Whether an invoice is paid, part paid or overdue is computed in
`v_invoice_ledger` from its payments and its due date:

| State | Means |
| --- | --- |
| **Draft** | Not issued. Stays draft however overdue the date |
| **Sent** | Issued, not yet due |
| **Overdue** | Issued, past its due date, nothing received |
| **Part paid** | Something received, balance remaining |
| **Paid** | Received ≥ total |
| **Void** | Cancelled. Removed from everything owed |

A stored "paid" flag would be a second source of truth for the same fact, and
the two drift the first time a payment is corrected.

## Payments

**Not capped at the outstanding balance.** Clients overpay, pay two invoices
with one cheque, and pay twice by mistake. Refusing the entry would not undo
any of that — it would just mean the books stop matching the bank. An
overpayment shows as a negative balance, labelled *overpaid*.

**Zero and negative amounts are refused**, by a database constraint. A
correction should be its own visible record, not a quietly edited number.

**Reverse archives, it does not delete.** A reversal is a record too.

## The accounting export

`/admin/invoices` has an export panel showing how many invoices and payments
accounting has not been given yet.

**Invoices** export in QuickBooks Online's import shape — one row per line
item, with the invoice header repeated on each. Drafts are never included: a
draft is not a document anyone should post to the books. An invoice with no
lines still appears, so a reconciliation against the ledger cannot silently
come up short.

**Payments** export as a plain CSV of what was received, against the invoice it
settles.

### Download, import, *then* mark exported

Marking is a separate button, on purpose. A download link that stamped rows as
exported would fire on a browser prefetch and quietly mark a batch nobody
imported — and afterwards there is no way to tell which invoices those were.

So: download → import into QuickBooks → confirm it was accepted → mark
exported. The batch is stamped with a timestamp on every affected row.

### Spreadsheet formula injection

A CSV cell beginning `=`, `+`, `-` or `@` is **executed** by Excel, Google
Sheets and LibreOffice when the file is opened. Client names and line
descriptions reach these files from a public form, so that is a live vector
aimed at whoever opens the export.

Every cell is RFC 4180 quoted, and anything starting with those characters gets
a leading apostrophe. `npm run check:csv` enforces it and runs in CI — verified
to fail when the protection is removed.

## Security

Staff-only, enforced by the database. `invoices`, `invoice_lines` and
`payments` each carry read, insert, update and delete policies gated on
`is_staff()`. `recalculate_invoice_totals()` is `SECURITY DEFINER` and revoked
from `public` and `anon`, per `0005`.

Verified against PostgreSQL 16 that a `client`-role user and an anonymous
caller each see zero invoices, zero payments and zero ledger rows.

## What is not built

- No PDF invoice. Nothing renders an invoice a client could be sent yet.
- No emailing an invoice.
- No payment processing, deliberately.
- No credit notes. A void plus a fresh invoice is the current answer.
- No recurring or progress billing.
- No two-way accounting sync. Records flow out only, by design.
- No per-line tax. Tax is one rate on the whole invoice, which is wrong for
  jurisdictions that tax services and materials differently.
