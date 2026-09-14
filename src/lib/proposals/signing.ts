import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The signing link, and the hash that stands behind a signature.
 *
 * THE LINK IS A CREDENTIAL
 *
 * Nobody creates an account to accept a proposal, so the URL is the only thing
 * proving the person opening it is the person TDR sent it to. That makes the
 * token a password, and it is handled like one:
 *
 *   * 32 bytes from the CSPRNG — 256 bits, not a guessable id.
 *   * Only its SHA-256 reaches the database. A copy of the database, a backup
 *     on a laptop, or a leaked query log lets nobody sign anything.
 *   * The raw token exists in the link and in the browser's address bar, and
 *     nowhere else in this system.
 *
 * Hashing here rather than in SQL is deliberate: the secret never travels to
 * the database at all, so it cannot turn up in `pg_stat_statements` or in a
 * slow-query log.
 *
 * A plain SHA-256 is right here and a password hash (bcrypt/argon2) would not
 * be. Those are slow on purpose to frustrate guessing a low-entropy human
 * secret; this secret has 256 bits of entropy, so there is nothing to guess,
 * and the lookup has to be a single indexed equality.
 */

/** 43 URL-safe characters from 32 random bytes. */
export function generateProposalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashProposalToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * What the client was shown, frozen at send.
 *
 * ESIGN and UETA both turn on the record being retained and accurately
 * reproducible. Rebuilding the document later from rows that have since moved
 * is not the same thing as keeping it, so the snapshot is stored verbatim and
 * the hash of it is what a signature names.
 *
 * Key order is fixed by construction rather than by `JSON.stringify` of an
 * object literal, because a hash that changes when a field is reordered would
 * flag honest documents as tampered with and teach everyone to ignore it.
 */
export type ProposalSnapshot = {
  proposal_number: string;
  title: string;
  scope: string | null;
  exclusions: string | null;
  terms: string | null;
  valid_until: string | null;
  currency: string;
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total: string;
  addressed_to: string | null;
  company: string | null;
  property: string | null;
  document_filename: string | null;
  lines: Array<{
    description: string;
    quantity: string;
    unit_price: string;
    amount: string;
  }>;
  frozen_at: string;
};

export function buildSnapshot(input: {
  proposalNumber: string;
  title: string;
  scope: string | null;
  exclusions: string | null;
  terms: string | null;
  validUntil: string | null;
  currency: string;
  subtotal: number | string;
  taxRate: number | string;
  taxAmount: number | string;
  total: number | string;
  addressedTo: string | null;
  company: string | null;
  property: string | null;
  documentFilename: string | null;
  lines: Array<{
    description: string;
    quantity: number | string;
    unit_price: number | string;
    amount: number | string;
  }>;
}): ProposalSnapshot {
  // Amounts as strings, exactly as PostgreSQL's numeric returns them. Passing
  // them through a JavaScript number first would round 5791.38 to something
  // that is nearly 5791.38, and the hash would then depend on floating point.
  const money = (v: number | string) => String(v);

  return {
    proposal_number: input.proposalNumber,
    title: input.title,
    scope: input.scope,
    exclusions: input.exclusions,
    terms: input.terms,
    valid_until: input.validUntil,
    currency: input.currency,
    subtotal: money(input.subtotal),
    tax_rate: money(input.taxRate),
    tax_amount: money(input.taxAmount),
    total: money(input.total),
    addressed_to: input.addressedTo,
    company: input.company,
    property: input.property,
    document_filename: input.documentFilename,
    lines: input.lines.map((l) => ({
      description: l.description,
      quantity: money(l.quantity),
      unit_price: money(l.unit_price),
      amount: money(l.amount),
    })),
    frozen_at: new Date().toISOString(),
  };
}

/**
 * The hash a signature names. Prefixed with the algorithm so a future change
 * is visible in the stored value rather than silently reinterpreting old ones.
 */
export function hashSnapshot(snapshot: ProposalSnapshot): string {
  return "sha256:" + createHash("sha256").update(canonical(snapshot), "utf8").digest("hex");
}

/**
 * Stable serialisation: keys sorted at every level, so the same document
 * always produces the same bytes regardless of how the object was assembled.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
}

/**
 * Constant-time comparison, for confirming a stored hash matches a recomputed
 * one. Not strictly required — both sides are already hashes — but comparing
 * secrets-adjacent values with `===` is a habit worth not having.
 */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The client's address, for the audit trail.
 *
 * Vercel sets `x-forwarded-for` and it is trustworthy there because the proxy
 * overwrites whatever the client sent. Behind a different proxy it may not be,
 * so this is recorded as evidence of where a signature came from, not relied
 * on to decide anything.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
