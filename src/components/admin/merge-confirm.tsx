"use client";

import { useEffect, useState } from "react";
import { impactOf, mergeClients, type Impact } from "@/app/admin/clients/actions";

/**
 * The confirm step shared by both ways of merging.
 *
 * A merge is not reversible from the admin. So the record about to be archived
 * is named, and what will move is counted and shown, before the button that
 * does it. "3 proposal requests will move" is a fact somebody can check; "Are
 * you sure?" is not.
 */

export type Party = { id: string; name: string; detail?: string };

export function MergeConfirm({
  kind,
  winner,
  loser,
  onCancel,
  onDone,
}: {
  kind: string;
  winner: Party;
  loser: Party;
  onCancel: () => void;
  onDone: (moved: Impact) => void;
}) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Fetch what is at stake as soon as a direction is chosen. Guarded against a
  // late response landing after the component is gone.
  useEffect(() => {
    let live = true;
    setLoading(true);
    impactOf(kind, loser.id)
      .then((result) => {
        if (live) setImpact(result);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [kind, loser.id]);

  async function onMerge() {
    setBusy(true);
    setError("");
    try {
      const result = await mergeClients({ kind, winnerId: winner.id, loserId: loser.id });
      if (!result.ok) setError(result.error);
      else onDone(result.moved);
    } catch {
      setError("The merge did not complete. Reload and check both records before retrying.");
    } finally {
      setBusy(false);
    }
  }

  const lines = impact
    ? ([
        ["proposal request", impact.opportunities],
        ["referral", impact.referrals],
        ["shipment", impact.shipments],
        ["website inquiry", impact.inquiries],
        ["person at the firm", impact.people],
      ] as const).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm text-ink-900">
        Keeping <strong>{winner.name}</strong>. <strong>{loser.name}</strong> will be archived.
      </p>

      {loading ? (
        <p className="mt-2 text-sm text-ink-500">Checking what is attached…</p>
      ) : lines.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-sm text-ink-700">
          {lines.map(([label, count]) => (
            <li key={label}>
              {count} {label}
              {count === 1 ? "" : "s"} will move to {winner.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-700">
          Nothing is attached to {loser.name} — only the record itself is archived.
        </p>
      )}

      <p className="mt-2 text-xs text-ink-600">
        Blank fields on {winner.name} are filled in from {loser.name}; anything already filled in is
        kept. Notes from both are preserved. This cannot be undone from here.
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onMerge}
          disabled={busy || loading}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
        >
          {busy ? "Merging…" : `Merge — keep ${winner.name}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
