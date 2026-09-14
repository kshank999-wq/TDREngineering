"use client";

import { useState } from "react";
import {
  grantPortalAccess,
  setPortalCompanyAccess,
  setPortalActive,
} from "@/app/admin/clients/portal-actions";

export type PortalGrant = {
  user_id: string;
  email: string;
  company_access: boolean;
  is_active: boolean;
  invited_at: string;
  last_seen_at: string | null;
};

/**
 * Grants a client a login to see their own work.
 *
 * The company-access switch is the one that deserves a second's thought: it
 * widens what this person sees from their own jobs to everything their firm
 * has commissioned. Off unless somebody decides otherwise.
 */
export function PortalAccessPanel({
  contactId,
  contactEmail,
  companyName,
  grant,
}: {
  contactId: string;
  contactEmail: string | null;
  companyName: string | null;
  grant: PortalGrant | null;
}) {
  const [email, setEmail] = useState(contactEmail ?? "");
  const [companyAccess, setCompanyAccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function onGrant() {
    setBusy(true);
    setError("");
    setLink(null);
    try {
      const result = await grantPortalAccess({ contactId, email, companyAccess });
      if (!result.ok) setError(result.error);
      else {
        setLink(result.inviteLink);
        setMessage(result.message);
      }
    } catch {
      setError("Could not grant access. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (link || message) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-900">{message}</p>
        {link ? (
          <textarea
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            rows={3}
            className="mt-3 w-full rounded-md border border-emerald-300 bg-white px-3 py-2 font-mono text-xs text-ink-800"
          />
        ) : null}
        <p className="mt-2 text-xs text-emerald-800">
          Send it the way you normally talk to this client. Reload the page when you are done —
          the link is not stored.
        </p>
      </div>
    );
  }

  if (grant) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink-900">{grant.email}</p>
            <p className="text-xs text-ink-500">
              {grant.is_active ? "Active" : "Access switched off"} ·{" "}
              {grant.last_seen_at
                ? `last signed in ${new Date(grant.last_seen_at).toLocaleDateString()}`
                : "has not signed in yet"}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              grant.is_active ? "bg-emerald-100 text-emerald-800" : "bg-ink-100 text-ink-600"
            }`}
          >
            {grant.is_active ? "Has access" : "Revoked"}
          </span>
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={grant.company_access}
            disabled={busy}
            onChange={async (e) => {
              setBusy(true);
              const result = await setPortalCompanyAccess({
                userId: grant.user_id,
                contactId,
                companyAccess: e.target.checked,
              });
              if (!result.ok) setError(result.error);
              setBusy(false);
            }}
            className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-ink-700">
            Can see all {companyName ? companyName : "their firm"}&rsquo;s jobs
            <span className="block text-xs text-ink-500">
              Otherwise only jobs where they are the named contact.
            </span>
          </span>
        </label>

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await setPortalActive({
              userId: grant.user_id,
              contactId,
              isActive: !grant.is_active,
            });
            if (!result.ok) setError(result.error);
            setBusy(false);
          }}
          className="rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60"
        >
          {grant.is_active ? "Switch access off" : "Switch access back on"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <p className="text-sm text-ink-600">
        Give this client a login to see their own jobs, documents and invoices.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Their email
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@firm.com"
          className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
      </label>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={companyAccess}
          onChange={(e) => setCompanyAccess(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-ink-700">
          Can see all {companyName ? companyName : "their firm"}&rsquo;s jobs
          <span className="block text-xs text-ink-500">
            Leave off and they see only jobs where they are the named contact.
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={onGrant}
        disabled={busy || !email.includes("@")}
        className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
      >
        {busy ? "Creating…" : "Give portal access"}
      </button>
    </div>
  );
}
