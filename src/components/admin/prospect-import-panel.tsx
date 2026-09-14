"use client";

import { useState } from "react";
import {
  previewProspectImport,
  runProspectImport,
  type ImportSummary,
} from "@/app/admin/prospects/actions";

type Preview = {
  candidates: Array<{ email: string; firstName: string; lastName: string; company: string | null }>;
  skippedNoEmail: number;
  duplicatesInFile: number;
  headers: string[];
  recognised: string[];
  suppressed: number;
};

/**
 * Importing a spreadsheet, in two steps.
 *
 * Preview first, always. A prospect list is hard to un-import once the rows
 * are mixed in with real contacts, and the things worth knowing beforehand —
 * how many rows have no address, which columns were recognised, how many
 * people already opted out — are invisible otherwise.
 */
export function ProspectImportPanel({ listId }: { listId: string }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setSummary(null);
    try {
      const text = await file.text();
      const result = await previewProspectImport(text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCsv(text);
      setFilename(file.name);
      setPreview(result.preview);
    } catch {
      setError("That file could not be read. Save it as CSV and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!csv) return;
    setBusy(true);
    setError(null);
    const result = await runProspectImport({ listId, filename, csv });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSummary(result.summary);
    setPreview(null);
    setCsv(null);
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-ink-900">Import a spreadsheet</h2>
      <p className="mt-1 text-sm text-ink-600">
        A CSV with an email column. Other columns — name, company, title, phone — are matched
        by their headers, whatever they are called.
      </p>

      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
        className="mt-4 text-sm"
      />

      {busy ? <p className="mt-3 text-sm text-ink-500">Working…</p> : null}

      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {preview ? (
        <div className="mt-5 rounded-md border border-ink-200 p-4">
          <h3 className="font-semibold text-ink-900">
            {preview.candidates.length} {preview.candidates.length === 1 ? "person" : "people"}{" "}
            ready to import
          </h3>

          <ul className="mt-2 space-y-1 text-sm text-ink-600">
            <li>Columns recognised: {preview.recognised.join(", ") || "none"}</li>
            {preview.skippedNoEmail > 0 ? (
              <li>{preview.skippedNoEmail} rows have no usable email address and are skipped.</li>
            ) : null}
            {preview.duplicatesInFile > 0 ? (
              <li>{preview.duplicatesInFile} rows repeat an address already in the file.</li>
            ) : null}
            {preview.suppressed > 0 ? (
              <li className="text-amber-800">
                {preview.suppressed} have already opted out. They will be added to the list but
                can never be emailed — that is deliberate, so re-importing this file does not
                keep resurrecting them.
              </li>
            ) : null}
          </ul>

          {preview.candidates.length > 0 ? (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-ink-500">
                  <th className="py-1 font-medium">Name</th>
                  <th className="py-1 font-medium">Email</th>
                  <th className="py-1 font-medium">Company</th>
                </tr>
              </thead>
              <tbody>
                {preview.candidates.slice(0, 5).map((c) => (
                  <tr key={c.email} className="border-b border-ink-100">
                    <td className="py-1 pr-3">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                    </td>
                    <td className="py-1 pr-3">{c.email}</td>
                    <td className="py-1">{c.company ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {preview.candidates.length > 5 ? (
            <p className="mt-1 text-xs text-ink-500">
              …and {preview.candidates.length - 5} more.
            </p>
          ) : null}

          <div className="mt-4 flex gap-3">
            <button
              onClick={onConfirm}
              disabled={busy || preview.candidates.length === 0}
              className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-ink-300"
            >
              Import these {preview.candidates.length}
            </button>
            <button
              onClick={() => {
                setPreview(null);
                setCsv(null);
              }}
              className="rounded-md px-4 py-2 text-sm text-ink-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="mt-5 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-900">Imported.</p>
          <ul className="mt-2 space-y-1 text-emerald-800">
            <li>{summary.added} new contacts created</li>
            <li>{summary.matched} matched to people already in the database</li>
            {summary.suppressed > 0 ? (
              <li>{summary.suppressed} are on the do-not-email list and will not be mailed</li>
            ) : null}
            {summary.skipped > 0 ? <li>{summary.skipped} rows skipped</li> : null}
          </ul>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm underline text-emerald-900"
          >
            Refresh the list
          </button>
        </div>
      ) : null}
    </section>
  );
}
