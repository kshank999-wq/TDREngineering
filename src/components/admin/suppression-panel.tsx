"use client";

import { useState } from "react";
import {
  suppressEmailAddress,
  liftSuppression,
  importSuppressions,
  type ActionResult,
} from "@/app/admin/prospects/actions";

/**
 * Two jobs in one component, chosen by whether `liftEmail` is given: the
 * add/import form at the top of the page, or the per-row "lift" button.
 */
export function SuppressionPanel({ liftEmail }: { liftEmail?: string }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  if (liftEmail) {
    return (
      <>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await liftSuppression(liftEmail);
            setBusy(false);
            setResult(r);
            if (r.ok) window.location.reload();
          }}
          className="text-xs text-ink-700 underline disabled:opacity-50"
        >
          Remove
        </button>
        {result && !result.ok ? (
          <p className="mt-1 text-xs text-red-700">{result.error}</p>
        ) : null}
      </>
    );
  }

  async function onAdd(formData: FormData) {
    setBusy(true);
    const r = await suppressEmailAddress(formData);
    setBusy(false);
    setResult(r);
    if (r.ok) window.location.reload();
  }

  async function onImport(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const r = await importSuppressions({
        csv: text,
        reason: "unsubscribed",
        source: file.name,
      });
      if (!r.ok) {
        setImportResult(r.error);
        return;
      }
      setImportResult(
        `${r.added} added to the do-not-email list${r.skipped > 0 ? `, ${r.skipped} lines skipped` : ""}.`,
      );
    } catch {
      setImportResult("That file could not be read.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-ink-900">Add somebody</h2>

      <form action={onAdd} className="mt-3 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
        <input
          name="email"
          type="email"
          required
          placeholder="their@email.com"
          className="rounded-md border border-ink-300 px-3 py-2 text-sm"
        />
        <select
          name="reason"
          defaultValue="manual"
          className="rounded-md border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="manual">Added by staff</option>
          <option value="unsubscribed">They asked to be removed</option>
          <option value="complained">Reported spam</option>
          <option value="bounced">Address bounced</option>
        </select>
        <button
          disabled={busy}
          className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-ink-300"
        >
          Add
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-500">
        &ldquo;They asked to be removed&rdquo; and &ldquo;Reported spam&rdquo; are permanent and
        cannot be undone. Use &ldquo;Added by staff&rdquo; if you may need to reverse it.
      </p>

      {result ? (
        result.ok ? (
          <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {result.message}
          </p>
        ) : (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {result.error}
          </p>
        )
      ) : null}

      <div className="mt-6 border-t border-ink-100 pt-5">
        <h3 className="font-medium text-ink-900">Import opt-outs from your mail provider</h3>
        <p className="mt-1 text-sm text-ink-600">
          If you send through an outside service, unsubscribes happen there. Pull them back
          here, or an export from this system will contain people who already opted out.
          A CSV with an email column, or one address per line.
        </p>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          disabled={importing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImport(file);
          }}
          className="mt-3 text-sm"
        />
        {importing ? <p className="mt-2 text-sm text-ink-500">Importing…</p> : null}
        {importResult ? (
          <p className="mt-2 rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-700">
            {importResult}
          </p>
        ) : null}
      </div>
    </section>
  );
}
