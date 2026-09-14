"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fileCategories, fileCategoryLabel } from "@/content/file-categories";
import {
  requestUpload,
  recordUpload,
  getDownloadUrl,
  setFileVisibility,
  archiveFile,
} from "@/app/admin/jobs/[id]/actions";

/**
 * Job files.
 *
 * The upload goes browser → storage directly, using a signed URL the server
 * mints. Nothing streams through the application, which is the only way a
 * multi-gigabyte scan can move at all: Vercel caps a serverless request body
 * at 4.5 MB.
 *
 * Downloads are short-lived signed links fetched on click rather than rendered
 * into the page, so a link cannot be scraped from the HTML and the URL stops
 * working minutes later.
 */

export type JobFile = {
  id: string;
  label: string | null;
  original_filename: string;
  content_type: string | null;
  byte_size: number | null;
  category: string;
  client_visible: boolean;
  uploaded_at: string;
  uploaded_by_name: string | null;
};

function readableSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function JobFilesPanel({ jobId, files }: { jobId: string; files: JobFile[] }) {
  const [category, setCategory] = useState<string>("deliverable");
  const [clientVisible, setClientVisible] = useState(false);
  const [label, setLabel] = useState("");
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (chosen.length === 0) return;

    setError("");
    const supabase = supabaseBrowser();

    for (const file of chosen) {
      setProgress({ name: file.name, pct: 0 });

      let driveFileId = "";
      const ticket = await requestUpload({
        jobId,
        filename: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      });
      if (!ticket.ok) {
        setError(ticket.error);
        setProgress(null);
        return;
      }

      setProgress({ name: file.name, pct: 35 });

      // Two providers, two shapes. Cloud storage takes a plain PUT to the
      // presigned URL; Supabase needs its own token. Either way the bytes go
      // straight from the browser to storage and never through the server.
      if (ticket.provider === "google_drive") {
        // Drive assigns the id, so it only exists after the bytes land. The
        // resumable session URL needs no auth header — that is what lets the
        // browser send straight to Google.
        const response = await fetch(ticket.uploadUrl, {
          method: "PUT",
          body: file,
          headers: ticket.headers,
        });
        if (!response.ok) {
          setError(`${file.name} did not upload (${response.status}). Try again.`);
          setProgress(null);
          return;
        }
        try {
          const created = (await response.json()) as { id?: string };
          if (!created.id) throw new Error("no id");
          driveFileId = created.id;
        } catch {
          setError(`${file.name} uploaded but Google did not confirm it. Check Drive.`);
          setProgress(null);
          return;
        }
      } else if (ticket.provider === "s3") {
        const response = await fetch(ticket.uploadUrl, {
          method: "PUT",
          body: file,
          headers: ticket.headers,
        });
        if (!response.ok) {
          setError(`${file.name} did not upload (${response.status}). Try again.`);
          setProgress(null);
          return;
        }
      } else {
        const { error: uploadError } = await supabase.storage
          .from(ticket.bucket)
          .uploadToSignedUrl(ticket.path, ticket.token ?? "", file, {
            contentType: file.type || "application/octet-stream",
          });

        if (uploadError) {
          setError(`${file.name} did not upload: ${uploadError.message}`);
          setProgress(null);
          return;
        }
      }

      setProgress({ name: file.name, pct: 85 });

      const recorded = await recordUpload({
        jobId,
        provider: ticket.provider,
        bucket: ticket.bucket,
        // For Drive the path is the file id Google just assigned.
        path: ticket.provider === "google_drive" ? driveFileId : ticket.path,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        category,
        clientVisible,
        label: chosen.length === 1 ? label : "",
      });

      if (!recorded.ok) {
        setError(recorded.error);
        setProgress(null);
        return;
      }
    }

    setProgress(null);
    setLabel("");
  }

  async function onDownload(fileId: string) {
    setBusyId(fileId);
    setError("");
    try {
      const result = await getDownloadUrl(fileId);
      if (!result.ok) setError(result.error);
      else window.open(result.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusyId(null);
    }
  }

  async function onToggle(file: JobFile) {
    setBusyId(file.id);
    setError("");
    try {
      const result = await setFileVisibility({
        fileId: file.id,
        jobId,
        clientVisible: !file.client_visible,
      });
      if (!result.ok) setError(result.error);
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(file: JobFile) {
    setBusyId(file.id);
    setError("");
    try {
      const result = await archiveFile({ fileId: file.id, jobId });
      if (!result.ok) setError(result.error);
    } finally {
      setBusyId(null);
    }
  }

  const uploading = progress !== null;

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              What is it
            </span>
            <select
              id="file-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            >
              {fileCategories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-500">
              {fileCategories.find((c) => c.value === category)?.hint}
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Label (optional)
            </span>
            <input
              id="file-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Signed ALTA, rev B"
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            />
          </label>
        </div>

        <label className="mt-3 flex items-start gap-2.5">
          <input
            id="file-visible"
            type="checkbox"
            checked={clientVisible}
            onChange={(e) => setClientVisible(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-ink-700">
            Share with the client
            <span className="block text-xs text-ink-500">
              Off by default. Files stay internal until you say otherwise.
            </span>
          </span>
        </label>

        <div className="mt-4">
          <label
            htmlFor="file-input"
            className={`inline-flex cursor-pointer items-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 ${
              uploading ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {uploading ? "Uploading…" : "Choose files"}
          </label>
          <input
            id="file-input"
            type="file"
            multiple
            onChange={onPick}
            disabled={uploading}
            className="sr-only"
          />
          <span className="ml-3 text-xs text-ink-500">Up to 5 GB per file</span>
        </div>

        {progress ? (
          <div className="mt-3">
            <p className="truncate text-xs text-ink-600">{progress.name}</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-ink-500">No files on this job yet.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">
                  {file.label || file.original_filename}
                </p>
                {file.label ? (
                  <p className="truncate font-mono text-xs text-ink-400">
                    {file.original_filename}
                  </p>
                ) : null}
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-600">
                    {fileCategoryLabel(file.category)}
                  </span>
                  {file.client_visible ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                      Shared with client
                    </span>
                  ) : null}
                  <span className="tabular-nums">{readableSize(file.byte_size)}</span>
                  <span>{new Date(file.uploaded_at).toLocaleDateString()}</span>
                  {file.uploaded_by_name ? <span>{file.uploaded_by_name}</span> : null}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDownload(file.id)}
                  disabled={busyId === file.id}
                  className="rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60"
                >
                  {busyId === file.id ? "…" : "Download"}
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(file)}
                  disabled={busyId === file.id}
                  className="rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60"
                >
                  {file.client_visible ? "Unshare" : "Share"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(file)}
                  disabled={busyId === file.id}
                  className="rounded-md px-2 py-1.5 text-xs font-medium text-ink-500 hover:text-red-700 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
