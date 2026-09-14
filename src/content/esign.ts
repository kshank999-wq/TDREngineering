/**
 * The electronic-signature disclosure.
 *
 * WHY THIS IS A CONTENT FILE AND NOT A STRING IN A COMPONENT
 *
 * The exact wording shown to a signer is stored with their signature, because
 * consent to a sentence nobody kept a copy of is not evidence of consent to
 * anything. That means this text is part of the record, so it is versioned:
 * change the wording and bump `ESIGN_CONSENT_VERSION`, and old signatures go
 * on carrying the words their signer actually read.
 *
 * NOT LEGAL ADVICE. This is written to cover what the federal ESIGN Act and
 * the Uniform Electronic Transactions Act are generally understood to require
 * — intent, consent, attribution, integrity, retention — and TDR's attorney
 * should confirm it is sufficient for the contracts TDR actually sends. The
 * software records the facts; whether those facts are enough is a question for
 * a lawyer, not for this file.
 */

export const ESIGN_CONSENT_VERSION = "2026-09-v1";

export const ESIGN_INTENT_LABEL =
  "I intend to sign this proposal electronically, and I have the authority to accept it on behalf of the client named above.";

export const ESIGN_CONSENT_LABEL =
  "I agree to do business electronically with TDR Engineering and to receive this agreement and related records in electronic form.";

/**
 * The full disclosure, shown on the page and stored verbatim with the
 * signature. Kept as plain sentences rather than markup so what is stored and
 * what was displayed are the same thing.
 */
export const ESIGN_DISCLOSURE = [
  "Signing this proposal electronically has the same legal effect as signing it on paper.",
  "By typing your name and clicking Accept, you are signing this proposal and agreeing to its scope, exclusions, fee and terms as shown on this page.",
  "TDR Engineering will keep a record of this proposal exactly as it appears here, together with the date and time you signed, the name and email address you entered, and the network address your acceptance came from.",
  "You may request a paper copy of this proposal, or withdraw your consent to sign electronically, at any time before you sign by contacting TDR Engineering. There is no charge for either.",
  "To sign electronically you need a device with a current web browser and an email address where we can reach you.",
].join("\n\n");

/**
 * What gets stored on the signature row. One string, so the record is
 * self-contained: reading a signature five years from now tells you exactly
 * what the person agreed to without needing this file.
 */
export function consentRecord(): string {
  return [
    `Version: ${ESIGN_CONSENT_VERSION}`,
    "",
    ESIGN_DISCLOSURE,
    "",
    `Acknowledged: ${ESIGN_INTENT_LABEL}`,
    `Acknowledged: ${ESIGN_CONSENT_LABEL}`,
  ].join("\n");
}

/** Statuses a proposal can be in, for the staff board. */
export const proposalStates = [
  { value: "draft", label: "Draft", hint: "Not sent. Nobody outside the office can reach it." },
  { value: "awaiting_signature", label: "Awaiting signature", hint: "Out with the client." },
  { value: "accepted", label: "Accepted", hint: "Signed." },
  { value: "declined", label: "Declined", hint: "The client said no." },
  { value: "expired", label: "Expired", hint: "Ran past its validity date unsigned." },
  { value: "withdrawn", label: "Withdrawn", hint: "Pulled back by TDR." },
] as const;

export type ProposalState = (typeof proposalStates)[number]["value"];

export function proposalStateLabel(state: string): string {
  return proposalStates.find((s) => s.value === state)?.label ?? state;
}

/** How long a signing link lasts by default. */
export const DEFAULT_LINK_DAYS = 60;
