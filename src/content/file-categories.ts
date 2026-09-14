/**
 * What a job file is. Must match the `file_category` enum in
 * supabase/migrations/0007_job_files.sql.
 *
 * The distinction that matters is deliverable vs working: a deliverable is
 * what the client is owed and will eventually see in the portal; working files
 * are field data and calcs that exist so TDR can produce it.
 */
export const fileCategories = [
  {
    value: "deliverable",
    label: "Deliverable",
    hint: "The signed drawing, the report — what the client is owed",
  },
  { value: "working", label: "Working file", hint: "Field data, calcs, drafts" },
  { value: "reference", label: "Reference", hint: "What the client or a third party supplied" },
  { value: "correspondence", label: "Correspondence", hint: "Letters, approvals, email records" },
] as const;

export type FileCategory = (typeof fileCategories)[number]["value"];

export const fileCategoryLabel = (value: string) =>
  fileCategories.find((c) => c.value === value)?.label ?? value;
