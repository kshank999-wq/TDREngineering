"use client";

import { useState, useRef } from "react";
import {
  updateMarketingAsset,
  setMarketingPublic,
  archiveMarketingAsset,
  setCurrentMarketingVersion,
  createMarketingUploadUrl,
  addMarketingVersion,
  getMarketingVersionUrl,
  type ActionResult,
} from "@/app/admin/marketing/actions";
import { marketingCategories } from "@/content/marketing";
import { formatBytes } from "@/lib/uploads";

export type AssetForEditor = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  slug: string;
  is_public: boolean;
  archived_at: string | null;
  download_count: number;
  last_downloaded_at: string | null;
  current_version_id: string | null;
};

export type AssetVersion = {
  id: string;
  version: number;
  notes: string | null;
  created_at: string;
  original_filename: string;
  byte_size: number | null;
  uploaded_by_name: string | null;
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

export function MarketingAssetPanel({
  asset,
  versions,
  shareUrl,
}: {
  asset: AssetForEditor;
  versions: AssetVersion[];
  shareUrl: string;
}) {
  const [saveResult, setSaveResult] = useState<ActionResult | null>(null);
  const [shareResult, setShareResult] = useState<ActionResult | null>(null);
  const [versionResult, setVersionResult] = useState<ActionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const notesRef = useRef<HTMLInputElement>(null);

  const archived = Boolean(asset.archived_at);

  async function onSave(formData: FormData) {
    formData.set("id", asset.id);
    setSaveResult(await updateMarketingAsset(formData));
  }

  async function onUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const prepared = await createMarketingUploadUrl({
        assetId: asset.id,
        filename: file.name,
        byteSize: file.size,
      });
      if (!prepared.ok) {
        setUploadError(prepared.error);
        return;
      }
      // Straight to storage: Vercel caps a serverless body at 4.5 MB, and a
      // print-resolution brochure is well past that.
      const put = await fetch(prepared.uploadUrl, {
        method: "PUT",
        body: file,
        headers: file.type ? { "content-type": file.type } : undefined,
      });
      if (!put.ok) {
        setUploadError("The upload did not complete. Please try again.");
        return;
      }
      const added = await addMarketingVersion({
        assetId: asset.id,
        path: prepared.path,
        filename: file.name,
        contentType: file.type || null,
        byteSize: file.size,
        notes: notesRef.current?.value?.trim() || null,
      });
      if (!added.ok) setUploadError(added.error);
      else window.location.reload();
    } catch {
      setUploadError("The upload did not complete. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function openVersion(versionId: string) {
    const result = await getMarketingVersionUrl(versionId);
    if (result.ok) window.open(result.url, "_blank", "noopener");
    else setVersionResult(result);
  }

  return (
    <div className="space-y-6">
      {archived ? (
        <div className="rounded-lg border border-ink-300 bg-ink-50 p-4 text-sm">
          <p className="font-semibold text-ink-900">Archived.</p>
          <p className="mt-1 text-ink-600">
            Its link no longer works. The web address <code>{asset.slug}</code> is kept and never
            reused, so an old link can stop working but can never point at something else.
          </p>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ share */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">Sharing</h2>

        {asset.is_public && !archived ? (
          <>
            <p className="mt-1 text-sm text-ink-600">
              Anyone with this link can download the current version. Replace the file and this
              link serves the new one — there is no need to send it again.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-ink-300 bg-ink-50 px-3 py-2 text-sm"
              />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                }}
                className="shrink-0 rounded-md border border-ink-300 px-3 py-2 text-sm"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={async () =>
                setShareResult(await setMarketingPublic({ id: asset.id, isPublic: false }))
              }
              className="mt-3 rounded-md border border-ink-300 px-4 py-2 text-sm font-medium"
            >
              Stop sharing
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-600">
              Not shared. Nobody outside the office can reach it.
            </p>
            <button
              disabled={archived}
              onClick={async () =>
                setShareResult(await setMarketingPublic({ id: asset.id, isPublic: true }))
              }
              className="mt-3 rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-ink-300"
            >
              Share by link
            </button>
          </>
        )}
        <Note result={shareResult} />

        <p className="mt-4 text-xs text-ink-500">
          {asset.download_count} download{asset.download_count === 1 ? "" : "s"}
          {asset.last_downloaded_at
            ? ` · last ${new Date(asset.last_downloaded_at).toLocaleDateString()}`
            : ""}
        </p>
      </section>

      {/* ---------------------------------------------------------- details */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">Details</h2>
        <form action={onSave} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">Title</span>
              <input
                name="title"
                defaultValue={asset.title}
                required
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">Category</span>
              <select
                name="category"
                defaultValue={asset.category}
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
              >
                {marketingCategories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Description</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={asset.description ?? ""}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-ink-500">
              Shown on the share page.
            </span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Tags</span>
            <input
              name="tags"
              defaultValue={asset.tags.join(", ")}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
            />
          </label>

          <div className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
            Web address: <code className="text-ink-900">/m/{asset.slug}</code> — fixed when the
            item was created, so renaming it cannot break a link somebody already has.
          </div>

          <button className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white">
            Save
          </button>
          <Note result={saveResult} />
        </form>
      </section>

      {/* --------------------------------------------------------- versions */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">File</h2>
        <p className="mt-1 text-sm text-ink-600">
          Uploading replaces what the share link serves. The previous file is kept — superseding
          is not deleting.
        </p>

        <div className="mt-4 space-y-2">
          <label className="block">
            <span className="block text-sm font-medium text-ink-800">
              What changed (optional)
            </span>
            <input
              ref={notesRef}
              placeholder="Updated 2026 pricing"
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
            />
          </label>
          <input
            type="file"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
            }}
            className="text-sm"
          />
          {uploading ? <p className="text-sm text-ink-500">Uploading…</p> : null}
          {uploadError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{uploadError}</p>
          ) : null}
        </div>

        {versions.length > 0 ? (
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-500">
                <th className="py-2 font-medium">Version</th>
                <th className="py-2 font-medium">File</th>
                <th className="py-2 font-medium">Uploaded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => {
                const current = v.id === asset.current_version_id;
                return (
                  <tr key={v.id} className="border-b border-ink-100">
                    <td className="py-2 pr-3 align-top">
                      v{v.version}
                      {current ? (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                          Current
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <button
                        onClick={() => openVersion(v.id)}
                        className="text-ink-900 underline"
                      >
                        {v.original_filename}
                      </button>
                      {v.byte_size ? (
                        <span className="block text-xs text-ink-500">
                          {formatBytes(Number(v.byte_size))}
                        </span>
                      ) : null}
                      {v.notes ? (
                        <span className="block text-xs text-ink-600">{v.notes}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 align-top text-ink-600">
                      {new Date(v.created_at).toLocaleDateString()}
                      {v.uploaded_by_name ? (
                        <span className="block text-xs text-ink-500">{v.uploaded_by_name}</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right align-top">
                      {!current ? (
                        <button
                          onClick={async () =>
                            setVersionResult(
                              await setCurrentMarketingVersion({
                                assetId: asset.id,
                                versionId: v.id,
                              }),
                            )
                          }
                          className="text-xs text-ink-700 underline"
                        >
                          Make current
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Nothing uploaded yet. This item cannot be shared until there is a file.
          </p>
        )}
        <Note result={versionResult} />
      </section>

      {/* --------------------------------------------------------- archive */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">
          {archived ? "Restore" : "Archive"}
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          {archived
            ? "Puts it back in the library. Sharing stays off until you switch it on again."
            : "Takes it out of the library and stops its link working. Nothing is deleted."}
        </p>
        <button
          onClick={async () =>
            setShareResult(
              await archiveMarketingAsset({ id: asset.id, archived: !archived }),
            )
          }
          className="mt-3 rounded-md border border-ink-300 px-4 py-2 text-sm font-medium"
        >
          {archived ? "Restore this item" : "Archive this item"}
        </button>
      </section>
    </div>
  );
}
