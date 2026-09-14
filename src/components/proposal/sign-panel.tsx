"use client";

import { useState } from "react";
import { acceptProposal, declineProposal } from "@/app/proposal/[token]/actions";
import {
  ESIGN_DISCLOSURE,
  ESIGN_INTENT_LABEL,
  ESIGN_CONSENT_LABEL,
} from "@/content/esign";

/**
 * The signature block.
 *
 * Both acknowledgements are separate checkboxes and both start unticked. A
 * pre-ticked box is not consent, and "by continuing you agree" is not intent —
 * the whole point of the record is that the person did something deliberate.
 *
 * The disclosure is shown in full on the page rather than behind a link,
 * because what is stored with the signature is the text the signer could
 * actually see.
 */
export function SignPanel({
  token,
  contactName,
  companyName,
}: {
  token: string;
  contactName: string | null;
  companyName: string | null;
}) {
  const [name, setName] = useState(contactName ?? "");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [intent, setIntent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const ready = name.trim().length > 0 && intent && consent && !busy;

  async function onAccept(formData: FormData) {
    setBusy(true);
    setError(null);
    formData.set("token", token);
    const result = await acceptProposal(formData);
    setBusy(false);
    if (result.ok) setDone(result.message);
    else setError(result.error);
  }

  async function onDecline(formData: FormData) {
    setBusy(true);
    setError(null);
    formData.set("token", token);
    const result = await declineProposal(formData);
    setBusy(false);
    if (result.ok) setDone(result.message);
    else setError(result.error);
  }

  if (done) {
    return (
      <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-6">
        <p className="font-semibold text-emerald-900">{done}</p>
        <p className="mt-2 text-sm text-emerald-800">
          You can close this page. The link stays available as your copy.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-ink-900">Accept this proposal</h2>

      <div className="mt-4 rounded-md bg-ink-50 p-4 text-sm leading-relaxed text-ink-700">
        {ESIGN_DISCLOSURE.split("\n\n").map((para, i) => (
          <p key={i} className={i > 0 ? "mt-3" : ""}>
            {para}
          </p>
        ))}
      </div>

      <form action={onAccept} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-ink-800">
              Your full name <span className="text-red-600">*</span>
            </span>
            <input
              name="typed_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-ink-900"
            />
            <span className="mt-1 block text-xs text-ink-500">
              Typing your name here is your signature.
            </span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Your email</span>
            <input
              name="signer_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-ink-900"
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-ink-800">
            Your title{companyName ? ` at ${companyName}` : ""}
          </span>
          <input
            name="signer_title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-ink-900"
          />
        </label>

        <label className="flex gap-3 text-sm text-ink-800">
          <input
            type="checkbox"
            name="intent"
            checked={intent}
            onChange={(e) => setIntent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>{ESIGN_INTENT_LABEL}</span>
        </label>

        <label className="flex gap-3 text-sm text-ink-800">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>{ESIGN_CONSENT_LABEL}</span>
        </label>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={!ready}
          className="w-full rounded-md bg-ink-900 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink-300 sm:w-auto"
        >
          {busy ? "Recording…" : "Accept and sign"}
        </button>
      </form>

      <div className="mt-6 border-t border-ink-100 pt-5">
        {declining ? (
          <form action={onDecline} className="space-y-3">
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">
                If you would rather not go ahead, tell us why (optional)
              </span>
              <textarea
                name="reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-ink-900"
              />
            </label>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-50"
              >
                {busy ? "Recording…" : "Decline this proposal"}
              </button>
              <button
                type="button"
                onClick={() => setDeclining(false)}
                className="rounded-md px-4 py-2 text-sm text-ink-600 hover:text-ink-900"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setDeclining(true)}
            className="text-sm text-ink-600 underline hover:text-ink-900"
          >
            Not going ahead? Let us know
          </button>
        )}
      </div>
    </div>
  );
}
