"use client";

import { useState } from "react";
import { findMergeCandidates, type ClientHit, type Impact } from "@/app/admin/clients/actions";
import { MergeConfirm, type Party } from "./merge-confirm";

/**
 * Merging another record into the one being viewed.
 *
 * The duplicate detector only finds pairs that look alike. Two records for the
 * same firm filed under unrelated names — "booboo" and "DANS ARCH" — will
 * never be paired by string similarity, and only somebody who knows the client
 * can say they are the same. This is the path for that.
 *
 * The direction is fixed: the record you are looking at survives. Choosing a
 * winner on a page devoted to one of the two invites archiving the record you
 * came here to keep.
 */
export function MergePanel({ kind, id, name }: { kind: string; id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ClientHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<Party | null>(null);
  const [merged, setMerged] = useState<Impact | null>(null);

  async function onSearch() {
    setSearching(true);
    try {
      setHits(await findMergeCandidates({ kind, excludeId: id, query }));
    } finally {
      setSearching(false);
    }
  }

  if (merged) {
    return (
      <p className="text-sm text-emerald-800">
        Merged. {merged.opportunities} proposal request
        {merged.opportunities === 1 ? "" : "s"} and {merged.referrals} referral
        {merged.referrals === 1 ? "" : "s"} moved onto this record. Reload to see them.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-brand-600 hover:text-brand-500"
      >
        Merge another record into this one
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600">
        Find the duplicate. <strong>{name}</strong> is the record that will survive.
      </p>

      <div className="flex gap-2">
        <label htmlFor="merge-search" className="sr-only">
          Search for a record to merge in
        </label>
        <input
          id="merge-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearch();
            }
          }}
          placeholder="Name, company, email, phone…"
          className="min-w-0 flex-1 rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={searching || query.trim().length < 2}
          className="shrink-0 rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60"
        >
          {searching ? "…" : "Search"}
        </button>
      </div>

      {hits !== null && hits.length === 0 ? (
        <p className="text-sm text-ink-500">
          Nothing else matches that. Only {kind === "contact" ? "people" : "companies"} can merge
          into {kind === "contact" ? "a person" : "a company"}.
        </p>
      ) : null}

      {hits && hits.length > 0 && !chosen ? (
        <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
          {hits.map((hit) => (
            <li key={hit.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{hit.name}</p>
                {hit.detail ? <p className="truncate text-xs text-ink-500">{hit.detail}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setChosen(hit)}
                className="shrink-0 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50"
              >
                Merge in
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {chosen ? (
        <MergeConfirm
          kind={kind}
          winner={{ id, name }}
          loser={chosen}
          onCancel={() => setChosen(null)}
          onDone={(moved) => setMerged(moved)}
        />
      ) : null}

      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setChosen(null);
          setHits(null);
          setQuery("");
        }}
        className="text-xs font-medium text-ink-500 hover:text-ink-800"
      >
        Close
      </button>
    </div>
  );
}
