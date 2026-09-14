"use client";

import { useState, useRef } from "react";
import {
  updateProposal,
  addProposalLine,
  removeProposalLine,
  sendProposal,
  revokeProposalLink,
  withdrawProposal,
  createProposalDocumentUploadUrl,
  attachProposalDocument,
  getProposalDocumentUrl,
  type ActionResult,
} from "@/app/admin/proposals/documents/[id]/actions";
import { money } from "@/content/billing";
import { DEFAULT_LINK_DAYS } from "@/content/esign";

/**
 * The proposal editor.
 *
 * Its central behaviour: once a proposal is sent, the fields go read-only.
 * That mirrors the database trigger rather than replacing it — the trigger is
 * what actually enforces the freeze, and this just stops staff walking into a
 * refusal they could have seen coming.
 */

export type EditorProposal = {
  id: string;
  proposal_number: string;
  status: string;
  title: string;
  scope: string | null;
  exclusions: string | null;
  terms: string | null;
  notes: string | null;
  valid_until: string | null;
  tax_rate: string;
  subtotal: string;
  tax_amount: string;
  total: string;
  currency: string;
  content_hash: string | null;
  document_filename: string | null;
};

export type EditorLine = {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  amount: string;
};

export type EditorLink = {
  id: string;
  sent_to: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};

function Note({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    result.message ? (
      <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {result.message}
      </p>
    ) : null
  ) : (
    <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{result.error}</p>
  );
}

export function ProposalEditor({
  proposal,
  lines,
  links,
  defaultEmail,
}: {
  proposal: EditorProposal;
  lines: EditorLine[];
  links: EditorLink[];
  defaultEmail: string | null;
}) {
  const isDraft = proposal.status === "draft";
  const [saveResult, setSaveResult] = useState<ActionResult | null>(null);
  const [lineResult, setLineResult] = useState<ActionResult | null>(null);
  const [sendResult, setSendResult] = useState<ActionResult | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onSave(formData: FormData) {
    formData.set("id", proposal.id);
    setSaveResult(await updateProposal(formData));
  }

  async function onAddLine(formData: FormData) {
    formData.set("proposalId", proposal.id);
    const result = await addProposalLine(formData);
    setLineResult(result);
  }

  async function onSend(formData: FormData) {
    setBusy(true);
    formData.set("id", proposal.id);
    const result = await sendProposal(formData);
    setBusy(false);
    setSendResult(result);
    if (result.ok && result.link) setLink(result.link);
  }

  async function onUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const prepared = await createProposalDocumentUploadUrl({
        proposalId: proposal.id,
        filename: file.name,
        contentType: file.type || null,
        byteSize: file.size,
      });
      if (!prepared.ok) {
        setUploadError(prepared.error);
        return;
      }
      // Straight to storage. Vercel caps a serverless body at 4.5 MB, so the
      // bytes must not pass through a server action.
      const put = await fetch(prepared.uploadUrl, {
        method: "PUT",
        body: file,
        headers: file.type ? { "content-type": file.type } : undefined,
      });
      if (!put.ok) {
        setUploadError("The upload did not complete. Please try again.");
        return;
      }
      const attached = await attachProposalDocument({
        proposalId: proposal.id,
        path: prepared.path,
        filename: file.name,
        contentType: file.type || null,
        byteSize: file.size,
      });
      if (!attached.ok) setUploadError(attached.error);
      else window.location.reload();
    } catch {
      setUploadError("The upload did not complete. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function openDocument() {
    const result = await getProposalDocumentUrl(proposal.id);
    if (result.ok) window.open(result.url, "_blank", "noopener");
    else setUploadError(result.error);
  }

  return (
    <div className="space-y-6">
      {!isDraft ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">This proposal has been sent and is locked.</p>
          <p className="mt-1">
            Its scope, fee and terms cannot change — that is what makes a signature on it
            mean anything. To revise it, withdraw it and issue a new one.
          </p>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- terms */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">The offer</h2>
        <form action={onSave} className="mt-4 space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Title</span>
            <input
              name="title"
              defaultValue={proposal.title}
              disabled={!isDraft}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 disabled:bg-ink-50 disabled:text-ink-500"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Scope of work</span>
            <textarea
              name="scope"
              rows={5}
              defaultValue={proposal.scope ?? ""}
              disabled={!isDraft}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 disabled:bg-ink-50 disabled:text-ink-500"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Not included</span>
            <textarea
              name="exclusions"
              rows={3}
              defaultValue={proposal.exclusions ?? ""}
              disabled={!isDraft}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 disabled:bg-ink-50 disabled:text-ink-500"
            />
            <span className="mt-1 block text-xs text-ink-500">
              What this fee does not cover. Its own field because this is what gets argued
              about later.
            </span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Terms</span>
            <textarea
              name="terms"
              rows={4}
              defaultValue={proposal.terms ?? ""}
              disabled={!isDraft}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 disabled:bg-ink-50 disabled:text-ink-500"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">Valid until</span>
              <input
                name="valid_until"
                type="date"
                defaultValue={proposal.valid_until ?? ""}
                disabled={!isDraft}
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 disabled:bg-ink-50 disabled:text-ink-500"
              />
              <span className="mt-1 block text-xs text-ink-500">
                After this date it can no longer be accepted.
              </span>
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">Tax rate (%)</span>
              <input
                name="tax_rate"
                type="number"
                step="0.0001"
                min="0"
                defaultValue={(Number(proposal.tax_rate) * 100).toString()}
                disabled={!isDraft}
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 disabled:bg-ink-50 disabled:text-ink-500"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-ink-800">
              Internal notes (never shown to the client)
            </span>
            <textarea
              name="notes"
              rows={2}
              defaultValue={proposal.notes ?? ""}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Save
          </button>
          <Note result={saveResult} />
        </form>
      </section>

      {/* ----------------------------------------------------------- fee */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">Fee</h2>

        {lines.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">No lines yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-500">
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-ink-100">
                  <td className="py-2 pr-3">{line.description}</td>
                  <td className="py-2 text-right">{Number(line.quantity)}</td>
                  <td className="py-2 text-right">
                    {money(line.unit_price, proposal.currency)}
                  </td>
                  <td className="py-2 text-right font-medium">
                    {money(line.amount, proposal.currency)}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    {isDraft ? (
                      <form
                        action={async (formData: FormData) => {
                          formData.set("proposalId", proposal.id);
                          formData.set("lineId", line.id);
                          setLineResult(await removeProposalLine(formData));
                        }}
                      >
                        <button className="text-xs text-red-700 underline">Remove</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <dl className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-600">Subtotal</dt>
            <dd>{money(proposal.subtotal, proposal.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-600">Tax</dt>
            <dd>{money(proposal.tax_amount, proposal.currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-ink-200 pt-1 font-semibold">
            <dt>Total</dt>
            <dd>{money(proposal.total, proposal.currency)}</dd>
          </div>
        </dl>

        {isDraft ? (
          <form action={onAddLine} className="mt-4 grid gap-2 sm:grid-cols-[1fr_5rem_7rem_auto]">
            <input
              name="description"
              placeholder="Description"
              required
              className="rounded-md border border-ink-300 px-3 py-2 text-sm"
            />
            <input
              name="quantity"
              type="number"
              step="0.001"
              defaultValue="1"
              className="rounded-md border border-ink-300 px-3 py-2 text-sm"
            />
            <input
              name="unit_price"
              type="number"
              step="0.01"
              defaultValue="0"
              className="rounded-md border border-ink-300 px-3 py-2 text-sm"
            />
            <button className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium">
              Add
            </button>
          </form>
        ) : null}
        <Note result={lineResult} />
      </section>

      {/* ------------------------------------------------------ document */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">Proposal document</h2>
        <p className="mt-1 text-sm text-ink-600">
          Optional. Attach TDR&rsquo;s own proposal PDF and the client can download it from
          the signing page alongside the summary above.
        </p>

        {proposal.document_filename ? (
          <p className="mt-3 text-sm">
            <button onClick={openDocument} className="text-ink-900 underline">
              {proposal.document_filename}
            </button>
          </p>
        ) : null}

        {isDraft ? (
          <div className="mt-3">
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,application/pdf"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
              }}
              className="text-sm"
            />
            {uploading ? <p className="mt-2 text-sm text-ink-500">Uploading…</p> : null}
          </div>
        ) : null}
        {uploadError ? (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {uploadError}
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------- send */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">
          {isDraft ? "Send for signature" : "Signing links"}
        </h2>

        {proposal.status === "accepted" || proposal.status === "withdrawn" ? null : (
          <form action={onSend} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <label className="block">
                <span className="block text-sm font-medium text-ink-800">
                  Sending it to (recorded with the signature)
                </span>
                <input
                  name="sent_to"
                  type="email"
                  defaultValue={defaultEmail ?? ""}
                  className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-ink-800">Link lasts</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    name="link_days"
                    type="number"
                    min="1"
                    defaultValue={DEFAULT_LINK_DAYS}
                    className="w-20 rounded-md border border-ink-300 px-3 py-2"
                  />
                  <span className="text-sm text-ink-600">days</span>
                </div>
              </label>
            </div>

            {isDraft ? (
              <p className="text-sm text-ink-600">
                Sending locks the scope, fee and terms. Nothing is emailed — you get a link
                to pass on however you already talk to this client.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-ink-300"
            >
              {busy ? "Working…" : isDraft ? "Send and lock" : "Issue another link"}
            </button>
            <Note result={sendResult} />
          </form>
        )}

        {link ? (
          <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">
              Copy this link now — it is shown once and never stored.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs"
              />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
                className="shrink-0 rounded-md border border-emerald-400 px-3 py-2 text-sm"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : null}

        {links.length > 0 ? (
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-500">
                <th className="py-2 font-medium">Sent to</th>
                <th className="py-2 font-medium">Issued</th>
                <th className="py-2 font-medium">Opened</th>
                <th className="py-2 font-medium">State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const dead =
                  l.revoked_at || (l.expires_at && new Date(l.expires_at) < new Date());
                return (
                  <tr key={l.id} className="border-b border-ink-100">
                    <td className="py-2 pr-3">{l.sent_to ?? "—"}</td>
                    <td className="py-2 pr-3 text-ink-600">
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-3 text-ink-600">
                      {l.first_viewed_at
                        ? `${new Date(l.first_viewed_at).toLocaleDateString()} (${l.view_count}×)`
                        : "Not yet"}
                    </td>
                    <td className="py-2 pr-3">
                      {l.revoked_at ? (
                        <span className="text-ink-500">Revoked</span>
                      ) : dead ? (
                        <span className="text-ink-500">Expired</span>
                      ) : (
                        <span className="text-emerald-700">Live</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {!dead ? (
                        <form
                          action={async (formData: FormData) => {
                            formData.set("proposalId", proposal.id);
                            formData.set("tokenId", l.id);
                            await revokeProposalLink(formData);
                          }}
                        >
                          <button className="text-xs text-red-700 underline">Revoke</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>

      {/* ------------------------------------------------------ withdraw */}
      {proposal.status === "sent" ? (
        <section className="rounded-lg border border-ink-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-ink-900">Withdraw</h2>
          <p className="mt-1 text-sm text-ink-600">
            Pulls the proposal back and kills every link. Withdrawing is final — issue a new
            proposal to revise the offer.
          </p>
          <form
            action={async (formData: FormData) => {
              formData.set("id", proposal.id);
              await withdrawProposal(formData);
            }}
            className="mt-3"
          >
            <button className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-800">
              Withdraw this proposal
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
