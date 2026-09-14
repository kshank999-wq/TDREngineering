/**
 * Job statuses. The `value` strings must match the `job_status` enum in
 * supabase/migrations/0006_jobs.sql.
 *
 * These are the stages a survey actually moves through, not generic project
 * states: field work and licensed review are distinct steps because nothing
 * leaves the office without a licensed surveyor signing off on it.
 */
export const jobStatuses = [
  { value: "scheduled", label: "Scheduled", tone: "accent", open: true },
  { value: "field_work", label: "Field Work", tone: "info", open: true },
  { value: "processing", label: "Processing", tone: "info", open: true },
  { value: "review", label: "In Review", tone: "warn", open: true },
  { value: "delivered", label: "Delivered", tone: "good", open: true },
  { value: "on_hold", label: "On Hold", tone: "warn", open: true },
  { value: "complete", label: "Complete", tone: "good", open: false },
  { value: "cancelled", label: "Cancelled", tone: "muted", open: false },
] as const;

export type JobStatus = (typeof jobStatuses)[number]["value"];

export const jobStatusLabel = (value: string) =>
  jobStatuses.find((s) => s.value === value)?.label ?? value;

export const jobStatusTone = (value: string) =>
  jobStatuses.find((s) => s.value === value)?.tone ?? "muted";

/** Statuses that still need someone's attention — the default board view. */
export const openJobStatuses = jobStatuses.filter((s) => s.open).map((s) => s.value);
