/**
 * Storage constants for the proposal PDF TDR attaches.
 *
 * These live here rather than beside the server actions that use them because
 * a `"use server"` file may export ONLY async functions. Next enforces that
 * when the module loads, so a stray `export const` passes the build, passes
 * tsc, passes ESLint, and 500s the first time somebody uses the page. That
 * shipped to production once; `npm run check:actions` now catches it, and
 * constants go in files like this one.
 */

export const PROPOSAL_DOCUMENTS_BUCKET = "proposal-documents";

/** Matches the bucket's own limit in 0010. */
export const MAX_PROPOSAL_DOCUMENT_BYTES = 100 * 1024 * 1024;

/** Signed links are short-lived: a leaked URL should stop working quickly. */
export const PROPOSAL_DOCUMENT_TTL_SECONDS = 300;
