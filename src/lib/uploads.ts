/**
 * File-type and file-size validation for proposal attachments (spec §9, §15).
 *
 * Large CAD, BIM and point-cloud production datasets are deliberately NOT
 * accepted here — those belong to the later file-management / client portal
 * phase. The form accepts reference material only.
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 60 MB per submission
export const MAX_FILES = 10;

/** Extension → accepted MIME types. Both must match. */
const ALLOWED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  heic: ["image/heic", "image/heif", "application/octet-stream"],
  webp: ["image/webp"],
  tif: ["image/tiff"],
  tiff: ["image/tiff"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  zip: ["application/zip", "application/x-zip-compressed"],
  txt: ["text/plain"],
};

export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED)
  .map((ext) => `.${ext}`)
  .join(",");

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);

export type FileValidationResult =
  | { ok: true; extension: string; safeName: string }
  | { ok: false; error: string };

/** Strips directory components and anything that is not a safe filename char. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file";
  return base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 120);
}

export function validateFile(file: File): FileValidationResult {
  const safeName = sanitizeFilename(file.name);
  const extension = safeName.includes(".")
    ? safeName.split(".").pop()!.toLowerCase()
    : "";

  if (!extension || !(extension in ALLOWED)) {
    return {
      ok: false,
      error: `"${file.name}" is not an accepted file type. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: `"${file.name}" is empty.` };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `"${file.name}" is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. Large CAD, BIM and point-cloud files should not be sent through this form — TDR will arrange a transfer.`,
    };
  }
  // A browser may report an empty type for some files (notably .heic and .dwg
  // on some platforms); allow that only when the extension itself is accepted.
  if (file.type && !ALLOWED[extension].includes(file.type)) {
    return {
      ok: false,
      error: `"${file.name}" does not appear to be a valid ${extension.toUpperCase()} file.`,
    };
  }
  return { ok: true, extension, safeName };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
