"use client";

import { useState } from "react";
import {
  updateProspectList,
  archiveProspectList,
  addContactToList,
  type ActionResult,
} from "@/app/admin/prospects/actions";

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

export function ProspectListPanel({
  listId,
  name,
  description,
  purpose,
  archived,
}: {
  listId: string;
  name: string;
  description: string | null;
  purpose: string | null;
  archived: boolean;
}) {
  const [saveResult, setSaveResult] = useState<ActionResult | null>(null);
  const [addResult, setAddResult] = useState<ActionResult | null>(null);

  async function onSave(formData: FormData) {
    formData.set("id", listId);
    setSaveResult(await updateProspectList(formData));
  }

  async function onAdd(formData: FormData) {
    formData.set("listId", listId);
    const result = await addContactToList(formData);
    setAddResult(result);
    if (result.ok) window.location.reload();
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-ink-900">List settings</h2>

      <form action={onSave} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Name</span>
            <input
              name="name"
              defaultValue={name}
              required
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-800">What it is for</span>
            <input
              name="purpose"
              defaultValue={purpose ?? ""}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
            />
          </label>
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-ink-800">Description</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={description ?? ""}
            className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
          />
        </label>
        <button className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white">
          Save
        </button>
        <Note result={saveResult} />
      </form>

      <div className="mt-6 border-t border-ink-100 pt-5">
        <h3 className="font-medium text-ink-900">Add somebody already in the database</h3>
        <form action={onAdd} className="mt-2 flex flex-wrap gap-2">
          <input
            name="email"
            type="email"
            required
            placeholder="their@email.com"
            className="min-w-64 flex-1 rounded-md border border-ink-300 px-3 py-2 text-sm"
          />
          <button className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium">
            Add to list
          </button>
        </form>
        <Note result={addResult} />
      </div>

      <div className="mt-6 border-t border-ink-100 pt-5">
        <h3 className="font-medium text-ink-900">{archived ? "Restore" : "Archive"}</h3>
        <p className="mt-1 text-sm text-ink-600">
          {archived
            ? "Puts the list back."
            : "Takes the list out of the way. The people stay in the database — archiving a list is not an unsubscribe, and does not stop anyone being emailed from another list."}
        </p>
        <button
          onClick={async () =>
            setSaveResult(await archiveProspectList({ id: listId, archived: !archived }))
          }
          className="mt-3 rounded-md border border-ink-300 px-4 py-2 text-sm font-medium"
        >
          {archived ? "Restore this list" : "Archive this list"}
        </button>
      </div>
    </section>
  );
}
