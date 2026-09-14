/**
 * Contract checks for the electronic-signature primitives.
 *
 * These are the pieces a signature's meaning rests on, and none of them fail
 * loudly when they break:
 *
 *   * If the token hash stopped matching, every signing link would 404 — which
 *     looks like a content problem, not a security one.
 *   * If the snapshot hash stopped being stable, honest proposals would be
 *     flagged as tampered with, and everyone would learn to ignore the
 *     warning. That is worse than not having it.
 *   * If the raw token ever leaked into the stored value, a copy of the
 *     database would let somebody sign on a client's behalf.
 *
 * So they are checked here, and this runs in CI.
 */

import {
  generateProposalToken,
  hashProposalToken,
  buildSnapshot,
  hashSnapshot,
  hashesMatch,
  clientIp,
} from "../src/lib/proposals/signing";
import { consentRecord, ESIGN_CONSENT_VERSION } from "../src/content/esign";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  →  ${detail}` : ""}`);
  }
}

console.log("\ne-signature contract checks\n");

// ---------------------------------------------------------------- tokens ---
const token = generateProposalToken();
const token2 = generateProposalToken();

check("a token is URL-safe", /^[A-Za-z0-9_-]+$/.test(token), token);
check("a token carries 256 bits", Buffer.from(token, "base64url").length === 32);
check("two tokens differ", token !== token2);

const hash = hashProposalToken(token);
check("the hash is 64 hex characters", /^[0-9a-f]{64}$/.test(hash), hash);
check("hashing is deterministic", hashProposalToken(token) === hash);
check("a different token hashes differently", hashProposalToken(token2) !== hash);

// The whole point: what is stored must not contain what was sent.
check("the stored hash does not contain the token", !hash.includes(token));
check(
  "the token cannot be recovered from the hash by decoding",
  Buffer.from(hash, "hex").toString("base64url") !== token,
);

// -------------------------------------------------------------- snapshots ---
const base = {
  proposalNumber: "P-2026-0001",
  title: "ALTA survey, 12 Oak Lane",
  scope: "Boundary and ALTA/NSPS.",
  exclusions: "No wetlands delineation.",
  terms: "Net 30.",
  validUntil: "2026-10-14",
  currency: "USD",
  subtotal: "5350.00",
  taxRate: "0.0825",
  taxAmount: "441.38",
  total: "5791.38",
  addressedTo: "Dan Archer",
  company: "Dans Arch",
  property: "12 Oak Lane, Reno, NV",
  documentFilename: "proposal.pdf",
  lines: [
    { description: "ALTA survey", quantity: "1", unit_price: "4800.00", amount: "4800.00" },
    { description: "Monumentation", quantity: "4", unit_price: "137.50", amount: "550.00" },
  ],
};

const snapshot = buildSnapshot(base);
const hashA = hashSnapshot(snapshot);

check("the document hash names its algorithm", hashA.startsWith("sha256:"), hashA);
check("hashing the same document twice agrees", hashSnapshot(snapshot) === hashA);

// Stability is the property that makes a mismatch meaningful. A hash that
// moved when a key was reordered would cry wolf on every honest proposal.
const reordered = JSON.parse(JSON.stringify(snapshot));
const shuffled: Record<string, unknown> = {};
for (const key of Object.keys(reordered).reverse()) shuffled[key] = reordered[key];
check(
  "key order does not change the hash",
  hashSnapshot(shuffled as typeof snapshot) === hashA,
);

// `frozen_at` is part of the record, so two separately built snapshots of the
// same proposal legitimately differ. What must not differ is a re-hash of the
// SAME stored snapshot, which is what verification actually does.
const stored = JSON.parse(JSON.stringify(snapshot));
check("a stored snapshot re-hashes to its original", hashSnapshot(stored) === hashA);

// Every field that is part of the offer must move the hash.
const mutations: Array<[string, () => typeof base]> = [
  ["the total", () => ({ ...base, total: "5791.39" })],
  ["a line's amount", () => ({
    ...base,
    lines: [{ ...base.lines[0], amount: "4800.01" }, base.lines[1]],
  })],
  ["a line's description", () => ({
    ...base,
    lines: [{ ...base.lines[0], description: "ALTA survey (revised)" }, base.lines[1]],
  })],
  ["the scope", () => ({ ...base, scope: "Boundary only." })],
  ["the exclusions", () => ({ ...base, exclusions: "" })],
  ["the terms", () => ({ ...base, terms: "Net 60." })],
  ["the expiry date", () => ({ ...base, validUntil: "2026-12-31" })],
  ["the attached document", () => ({ ...base, documentFilename: "other.pdf" })],
  ["a removed line", () => ({ ...base, lines: [base.lines[0]] })],
];

for (const [what, mutate] of mutations) {
  const changed = buildSnapshot(mutate());
  // Compare against a snapshot built at the same moment, so the difference
  // being detected is the change and not the timestamp.
  const control = { ...buildSnapshot(base), frozen_at: changed.frozen_at };
  const changedFixed = { ...changed, frozen_at: changed.frozen_at };
  check(
    `changing ${what} changes the hash`,
    hashSnapshot(changedFixed) !== hashSnapshot(control),
  );
}

// Money must survive as written. 5791.38 through a float is not 5791.38.
const precise = buildSnapshot({ ...base, total: "0.1", subtotal: "0.2" });
check("amounts are not passed through a float", precise.total === "0.1");
check(
  "a long decimal is preserved exactly",
  buildSnapshot({ ...base, total: "12345678.91" }).total === "12345678.91",
);

// ------------------------------------------------------------ comparison ---
check("identical hashes match", hashesMatch(hashA, hashA));
check("different hashes do not match", !hashesMatch(hashA, hashSnapshot(precise)));
check("different lengths do not match", !hashesMatch(hashA, "short"));

// --------------------------------------------------------------- consent ---
const consent = consentRecord();
check("the consent record carries its version", consent.includes(ESIGN_CONSENT_VERSION));
check("the consent record states intent", /intend to sign/i.test(consent));
check(
  "the consent record states electronic consent",
  /do business electronically/i.test(consent),
);
check("the consent record mentions a paper copy", /paper copy/i.test(consent));
check("the consent record is self-contained", consent.length > 400);

// -------------------------------------------------------------------- ip ---
check(
  "the first forwarded address is taken",
  clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" })) === "203.0.113.9",
);
check(
  "x-real-ip is the fallback",
  clientIp(new Headers({ "x-real-ip": "198.51.100.4" })) === "198.51.100.4",
);
check("no header yields null", clientIp(new Headers()) === null);

console.log("");
if (failures > 0) {
  console.log(`${failures} e-signature check(s) FAILED.\n`);
  process.exit(1);
}
console.log("All e-signature contract checks passed.\n");
