"use client";

import { useState } from "react";
import { disconnectDrive } from "@/app/admin/settings/storage/actions";

/**
 * Disconnecting, with the consequence stated before the click.
 *
 * This is the one action on the page that can break existing downloads, so it
 * says so in numbers rather than in general terms. Nothing is deleted from
 * Drive — the files stay exactly where they are — but this application stops
 * being able to reach them until the account is reconnected.
 */
export function DisconnectDrive({ fileCount }: { fileCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-800"
      >
        Disconnect
      </button>
    );
  }

  return (
    <div className="w-full rounded-md border border-red-300 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-900">Disconnect this Google account?</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
        <li>Nothing is deleted. The files stay in Drive exactly where they are.</li>
        {fileCount > 0 ? (
          <li>
            <strong>{fileCount}</strong> file{fileCount === 1 ? "" : "s"} recorded here live in
            that Drive and will stop being downloadable through this site until you reconnect.
          </li>
        ) : null}
        <li>New uploads go back to whatever is configured below.</li>
      </ul>

      {error ? <p className="mt-2 text-sm text-red-900">{error}</p> : null}

      <div className="mt-3 flex gap-3">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await disconnectDrive();
            setBusy(false);
            if (result.ok) window.location.href = "/admin/settings/storage";
            else setError(result.error);
          }}
          className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:bg-red-300"
        >
          {busy ? "Disconnecting…" : "Yes, disconnect"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md px-4 py-2 text-sm text-ink-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
