/**
 * Legacy URL → new URL map (spec §14).
 *
 * HOW TO COMPLETE THIS FILE
 * -------------------------
 * 1. Run `npm run archive:crawl` (Phase 1A) against the live legacy site. It
 *    writes archive/inventory.csv with one row per discovered URL.
 * 2. For every legacy URL that is indexed or linked externally, add an entry
 *    below pointing at the closest equivalent new page. Never point an old
 *    service page at the homepage when a relevant service page exists — that
 *    discards the accumulated search equity for that page.
 * 3. Anything left unmapped will 404. Confirm that is intentional before
 *    launch and record the decision in the inventory's `notes` column.
 *
 * All entries are served as permanent 301 redirects (see next.config.ts).
 * Entries that never existed on the legacy site are harmless — they simply
 * never fire.
 */

export type LegacyRedirect = {
  from: string;
  to: string;
  /** Optional note carried over from the Phase 1A inventory. */
  note?: string;
};

export const legacyRedirects: LegacyRedirect[] = [
  // --- Low-risk conventional aliases -------------------------------------
  { from: "/index.html", to: "/" },
  { from: "/home", to: "/" },
  { from: "/home.html", to: "/" },
  { from: "/contact-us", to: "/contact" },
  { from: "/contact-us.html", to: "/contact" },
  { from: "/about-us", to: "/about" },
  { from: "/about-us.html", to: "/about" },
  { from: "/faq", to: "/questions" },
  { from: "/faqs", to: "/questions" },

  // --- Legacy quote workflow → new proposal workflow (spec §1, §7) -------
  { from: "/request-a-quote", to: "/request-a-proposal" },
  { from: "/request-quote", to: "/request-a-proposal" },
  { from: "/quote", to: "/request-a-proposal" },
  { from: "/get-a-quote", to: "/request-a-proposal" },
  { from: "/estimate", to: "/request-a-proposal" },

  // --- TODO(tdr, Phase 1A): append verified legacy URLs from the crawl ---
  // Example shape:
  // { from: "/services/land-surveying.html", to: "/services/boundary-survey", note: "KEEP — copy reused" },
];
