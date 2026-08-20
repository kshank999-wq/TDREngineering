/**
 * Referral tracking (spec §8).
 *
 * Referral source is a first-class business relationship, not a text field.
 * When the selected source is a professional type, the form collects the
 * referring person and company so the relationship can be associated with an
 * existing contact/company record instead of creating a duplicate.
 */

export type ReferralSource = {
  code: string;
  label: string;
  /** Professional sources capture the referring person and company. */
  professional: boolean;
  /** Default company type used when creating the referring company record. */
  companyType?: string;
};

export const referralSources: ReferralSource[] = [
  { code: "architect", label: "Architect", professional: true, companyType: "architecture" },
  {
    code: "structural-engineer",
    label: "Structural Engineer",
    professional: true,
    companyType: "structural-engineering",
  },
  {
    code: "civil-engineer",
    label: "Civil Engineer",
    professional: true,
    companyType: "civil-engineering",
  },
  { code: "contractor", label: "Contractor", professional: true, companyType: "contractor" },
  { code: "developer", label: "Developer", professional: true, companyType: "developer" },
  { code: "previous-client", label: "Previous Client", professional: false },
  { code: "search", label: "Google / Search", professional: false },
  { code: "social-media", label: "Social Media", professional: false },
  { code: "advertisement", label: "Advertisement", professional: false },
  { code: "other", label: "Other", professional: false },
];

export const referralSourceByCode = (code: string) =>
  referralSources.find((r) => r.code === code);

export const referralSourceCodes = new Set(referralSources.map((r) => r.code));

export const professionalReferralCodes = new Set(
  referralSources.filter((r) => r.professional).map((r) => r.code),
);
