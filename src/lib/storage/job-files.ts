import "server-only";
import { sanitizeFilename } from "@/lib/uploads";

/**
 * Job file storage.
 *
 * Bytes never pass through the application. Vercel caps a serverless request
 * body at 4.5 MB, and a point cloud is three orders of magnitude past that, so
 * anything that streams a file through a server action is broken for the files
 * TDR actually needs to move.
 *
 * Instead:
 *   upload    browser asks for a short-lived signed URL and PUTs straight to
 *             storage; the server only ever writes the metadata row.
 *   download  the server mints a short-lived signed URL and hands back a link.
 *
 * Provider is recorded per file (`files.storage_provider`), so moving to
 * Cloudflare R2 later is a per-file migration behind this module rather than a
 * rewrite — see docs/JOB-FILES.md for why R2 is the likely destination.
 */

export const JOB_FILES_BUCKET = "job-files";

/** Matches the bucket's own limit in 0007. Checked here so the user gets a
 *  sentence rather than an opaque storage error. */
export const MAX_JOB_FILE_BYTES = 5 * 1024 * 1024 * 1024;

/** Signed links are short-lived: a leaked URL should stop working quickly. */
export const DOWNLOAD_TTL_SECONDS = 300;
export const UPLOAD_TTL_SECONDS = 3600; // a 5 GB upload takes a while

/**
 * Where a file lives. Keyed by job so the bucket stays navigable in the
 * Supabase dashboard, and prefixed with a timestamp so re-uploading a file of
 * the same name does not overwrite the earlier one — superseding a drawing is
 * a decision, not a side effect of a filename collision.
 */
export function jobFilePath(jobId: string, filename: string): string {
  const safe = sanitizeFilename(filename) || "file";
  return `jobs/${jobId}/${Date.now()}-${safe}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
