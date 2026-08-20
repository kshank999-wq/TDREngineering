/**
 * Proposal statuses (spec §10). The `value` strings must match the
 * `opportunity_status` enum in supabase/migrations/0001_init.sql.
 */
export const opportunityStatuses = [
  { value: "new", label: "New", tone: "accent" },
  { value: "reviewing", label: "Reviewing", tone: "info" },
  { value: "need_information", label: "Need Information", tone: "warn" },
  { value: "proposal_in_preparation", label: "Proposal in Preparation", tone: "info" },
  { value: "proposal_sent", label: "Proposal Sent", tone: "info" },
  { value: "follow_up", label: "Follow-Up", tone: "warn" },
  { value: "won", label: "Won", tone: "good" },
  { value: "lost", label: "Lost", tone: "bad" },
  { value: "cancelled", label: "Cancelled", tone: "muted" },
] as const;

export type OpportunityStatus = (typeof opportunityStatuses)[number]["value"];

export const statusLabel = (value: string) =>
  opportunityStatuses.find((s) => s.value === value)?.label ?? value;

export const statusTone = (value: string) =>
  opportunityStatuses.find((s) => s.value === value)?.tone ?? "muted";

export const statusClasses: Record<string, string> = {
  accent: "bg-accent-500/15 text-brand-600 ring-accent-500/30",
  info: "bg-brand-600/10 text-brand-600 ring-brand-600/20",
  warn: "bg-amber-100 text-amber-800 ring-amber-300",
  good: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  bad: "bg-red-100 text-red-800 ring-red-300",
  muted: "bg-ink-100 text-ink-600 ring-ink-200",
};
