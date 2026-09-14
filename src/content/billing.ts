/**
 * Invoice and payment vocabulary. Must match the enums in
 * supabase/migrations/0008_billing.sql.
 *
 * Note the split: `invoiceStatuses` is what somebody *sets* — intent. The
 * `state` a person reads on screen is derived in v_invoice_ledger from the
 * payments and the due date, so it can never disagree with them.
 */
export const invoiceStatuses = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "void", label: "Void" },
] as const;

export const invoiceStates = [
  { value: "draft", label: "Draft", tone: "muted" },
  { value: "sent", label: "Sent", tone: "info" },
  { value: "partial", label: "Part paid", tone: "warn" },
  { value: "overdue", label: "Overdue", tone: "bad" },
  { value: "paid", label: "Paid", tone: "good" },
  { value: "void", label: "Void", tone: "muted" },
] as const;

export const invoiceStateLabel = (value: string) =>
  invoiceStates.find((s) => s.value === value)?.label ?? value;

export const invoiceStateTone = (value: string) =>
  invoiceStates.find((s) => s.value === value)?.tone ?? "muted";

/** States that represent money TDR is still owed. */
export const owingStates = ["sent", "partial", "overdue"];

export const paymentMethods = [
  { value: "check", label: "Check" },
  { value: "ach", label: "ACH / transfer" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const;

export const paymentMethodLabel = (value: string) =>
  paymentMethods.find((m) => m.value === value)?.label ?? value;

export const money = (value: unknown, currency = "USD") =>
  value == null
    ? "—"
    : Number(value).toLocaleString(undefined, { style: "currency", currency });
