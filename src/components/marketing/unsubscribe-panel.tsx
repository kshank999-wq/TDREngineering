"use client";

import { useState } from "react";
import { recordUnsubscribe } from "@/app/unsubscribe/[token]/actions";

/**
 * One button. No confirmation step, no survey, no "tell us why".
 *
 * Every extra click between somebody wanting out and being out raises the
 * chance they hit "report spam" instead — which hurts TDR's ability to deliver
 * ordinary proposal email far more than losing one prospect does.
 */
export function UnsubscribePanel({
  token,
  email,
  alreadySuppressed,
}: {
  token: string;
  email: string;
  alreadySuppressed: boolean;
}) {
  const [done, setDone] = useState(alreadySuppressed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <>
        <h1 className="mt-2 text-2xl font-bold text-ink-900">You have been unsubscribed</h1>
        <p className="mt-4 text-ink-700">
          We will not send marketing email to <strong>{email}</strong> again.
        </p>
      </>
    );
  }

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    formData.set("token", token);
    const result = await recordUnsubscribe(formData);
    setBusy(false);
    if (result.ok) setDone(true);
    else setError(result.error);
  }

  return (
    <>
      <h1 className="mt-2 text-2xl font-bold text-ink-900">Unsubscribe</h1>
      <p className="mt-4 text-ink-700">
        Stop sending marketing email to <strong>{email}</strong>.
      </p>

      <form action={onSubmit} className="mt-6">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-ink-900 px-5 py-3 font-semibold text-white disabled:bg-ink-300"
        >
          {busy ? "Removing…" : "Unsubscribe me"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
    </>
  );
}
