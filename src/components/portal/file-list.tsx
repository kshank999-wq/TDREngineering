"use client";

import { useState } from "react";
import { getPortalDownloadUrl } from "@/app/portal/actions";

export type PortalFile = {
  id: string;
  name: string;
  original_filename: string;
  byte_size: number | null;
  category: string;
  uploaded_at: string;
};

function size(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/**
 * Download links are fetched on click rather than rendered into the page, so
 * the signed URL never sits in the HTML and expires minutes after it is made.
 */
export function PortalFileList({ files }: { files: PortalFile[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (files.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        Nothing has been shared for this project yet. TDR will add documents here as the work
        progresses.
      </p>
    );
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-ink-100">
        {files.map((file) => (
          <li key={file.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{file.name}</p>
              <p className="text-xs text-ink-500">
                {[size(file.byte_size), new Date(file.uploaded_at).toLocaleDateString()]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              type="button"
              disabled={busy === file.id}
              onClick={async () => {
                setBusy(file.id);
                setError("");
                try {
                  const result = await getPortalDownloadUrl(file.id);
                  if (!result.ok) setError(result.error);
                  else window.open(result.url, "_blank", "noopener,noreferrer");
                } finally {
                  setBusy(null);
                }
              }}
              className="shrink-0 rounded-md border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60"
            >
              {busy === file.id ? "…" : "Download"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
