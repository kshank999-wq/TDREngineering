"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveAddress, type AddressState } from "@/app/admin/clients/[kind]/[id]/actions";

/**
 * The mailing address a label gets printed with.
 *
 * Deliberately not the project address. A survey is performed on a lot; the
 * plans go to an office. Storing one and using it for the other mails a tube
 * of drawings to an empty field.
 */

export type Address = {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

export function AddressForm({
  kind,
  id,
  address,
}: {
  kind: string;
  id: string;
  address: Address;
}) {
  // Declared here rather than alongside the action: a "use server" file can
  // export only async functions, so a shared initial-state constant there
  // brings the whole route down at runtime.
  const initial: AddressState = { status: "idle", message: "" };
  const [state, formAction] = useActionState(saveAddress, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />

      {state.status !== "idle" ? (
        <p
          role="status"
          className={`rounded-md border p-3 text-sm ${
            state.status === "saved"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <Field
        name="address_line1"
        label="Street address"
        defaultValue={address.address_line1}
        placeholder="1234 Main Street"
      />
      <Field
        name="address_line2"
        label="Suite / unit"
        defaultValue={address.address_line2}
        placeholder="Suite 200"
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_6rem_8rem]">
        <Field name="city" label="City" defaultValue={address.city} />
        <Field name="state" label="State" defaultValue={address.state} maxLength={2} />
        <Field name="postal_code" label="ZIP" defaultValue={address.postal_code} />
      </div>

      <div className="sm:max-w-[8rem]">
        <Field name="country" label="Country" defaultValue={address.country || "US"} maxLength={2} />
      </div>

      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save address"}
    </button>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  maxLength,
}: {
  name: string;
  label: string;
  defaultValue: string | null;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        maxLength={maxLength}
        className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      />
    </label>
  );
}
