import "server-only";
import { sanitizeFilename } from "@/lib/uploads";

/**
 * Marketing asset storage.
 *
 * Constants and path building live here rather than beside the server actions
 * that use them, because a `"use server"` file may export ONLY async
 * functions — see src/lib/proposals/documents.ts for the production incident
 * that taught us that.
 */

export const MARKETING_BUCKET = "marketing-assets";

/** Signed links are short-lived: a leaked URL should stop working quickly. */
export const MARKETING_DOWNLOAD_TTL_SECONDS = 300;
export const MARKETING_UPLOAD_TTL_SECONDS = 1800;

/**
 * Where a version's bytes live.
 *
 * Keyed by asset and version so the bucket stays navigable in the Supabase
 * dashboard, and timestamped so re-uploading a file of the same name cannot
 * overwrite an earlier version. Superseding a flyer keeps the old one — that
 * is the whole point of versions, and it would be undone by a path collision.
 */
export function marketingAssetPath(assetId: string, version: number, filename: string): string {
  const safe = sanitizeFilename(filename) || "asset";
  return `assets/${assetId}/v${version}-${Date.now()}-${safe}`;
}
