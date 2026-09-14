/**
 * Marketing asset vocabulary. Must match the `marketing_category` enum in
 * supabase/migrations/0011_marketing.sql.
 */

export const marketingCategories = [
  { value: "flyer", label: "Flyer", hint: "One-page handout for a single service" },
  { value: "brochure", label: "Brochure", hint: "Multi-page overview of TDR" },
  {
    value: "capability_statement",
    label: "Capability statement",
    hint: "What TDR does, for agencies and prime contractors",
  },
  { value: "rate_sheet", label: "Rate sheet", hint: "Published pricing" },
  { value: "spec_sheet", label: "Spec sheet", hint: "Equipment, accuracy, deliverable formats" },
  { value: "case_study", label: "Case study", hint: "A completed project written up" },
  { value: "presentation", label: "Presentation", hint: "Slides for a meeting or trade show" },
  { value: "photo", label: "Photography", hint: "Field and project imagery" },
  { value: "logo", label: "Logo / brand", hint: "Marks and brand files" },
  { value: "other", label: "Other", hint: "" },
] as const;

export type MarketingCategory = (typeof marketingCategories)[number]["value"];

export const marketingCategoryLabel = (value: string) =>
  marketingCategories.find((c) => c.value === value)?.label ?? value;

/** Matches the bucket's own limit in 0011. */
export const MAX_MARKETING_BYTES = 200 * 1024 * 1024;

/**
 * Tags are free text, but they are only useful if people spell them the same
 * way. Normalising here means "ALTA", "alta " and "Alta" are one tag.
 */
export function normalizeTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 40),
    ),
  ).slice(0, 20);
}
