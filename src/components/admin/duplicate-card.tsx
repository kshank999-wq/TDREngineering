"use client";

import { useState } from "react";
import Link from "next/link";
import { MergeConfirm, type Party } from "./merge-confirm";
import type { Impact } from "@/app/admin/clients/actions";

/**
 * One candidate pair. Both records are shown side by side with everything
 * known about them, because the decision is which one to keep — and that is
 * not a decision anyone can make from two names alone.
 *
 * Neither side is preselected. The pair is a suggestion from string matching,
 * and "not a duplicate" is a perfectly good answer.
 */
export function DuplicateCard({
  kind,
  a,
  b,
  reason,
}: {
  kind: string;
  a: Party & { createdAt: string };
  b: Party & { createdAt: string };
  reason: string;
}) {
  const [winner, setWinner] = useState<Party | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [merged, setMerged] = useState<{ name: string; moved: Impact } | null>(null);

  if (merged) {
    return (
      <li className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
        <p className="text-sm font-semibold text-emerald-900">
          Merged. {merged.name} is now the single record.
        </p>
        <p className="mt-1 text-xs text-emerald-800">
          {merged.moved.opportunities} proposal request
          {merged.moved.opportunities === 1 ? "" : "s"}, {merged.moved.referrals} referral
          {merged.moved.referrals === 1 ? "" : "s"} and {merged.moved.shipments} shipment
          {merged.moved.shipments === 1 ? "" : "s"} moved across.
        </p>
      </li>
    );
  }

  if (dismissed) return null;

  const loser = winner ? (winner.id === a.id ? b : a) : null;

  return (
    <li className="rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
          {reason}
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs font-medium text-ink-500 hover:text-ink-800"
        >
          Not a duplicate — hide
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {[a, b].map((record) => (
          <div key={record.id} className="rounded-lg border border-ink-200 p-4">
            <Link
              href={`/admin/clients/${kind}/${record.id}`}
              className="font-semibold text-brand-600 hover:text-brand-500"
            >
              {record.name}
            </Link>
            <p className="mt-1 text-sm text-ink-600">{record.detail || "No other details"}</p>
            <p className="mt-1 text-xs text-ink-400">
              Added {new Date(record.createdAt).toLocaleDateString()}
            </p>
            {!winner ? (
              <button
                type="button"
                onClick={() => setWinner(record)}
                className="mt-3 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50"
              >
                Keep this one
              </button>
            ) : winner.id === record.id ? (
              <p className="mt-3 rounded-md bg-brand-600/10 px-3 py-2 text-center text-sm font-semibold text-brand-600">
                Keeping this
              </p>
            ) : (
              <p className="mt-3 rounded-md bg-ink-100 px-3 py-2 text-center text-sm font-medium text-ink-500">
                Will be archived
              </p>
            )}
          </div>
        ))}
      </div>

      {winner && loser ? (
        <MergeConfirm
          kind={kind}
          winner={winner}
          loser={loser}
          onCancel={() => setWinner(null)}
          onDone={(moved) => setMerged({ name: winner.name, moved })}
        />
      ) : null}
    </li>
  );
}
