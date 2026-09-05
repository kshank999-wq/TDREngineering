"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { quoteRates, purchaseLabel, type Rate, type ShippoAddress } from "@/lib/shipping/shippo";
import { env } from "@/lib/env";

/**
 * Server actions for the client record: editing the mailing address, quoting
 * shipping rates, and buying a label.
 *
 * The two shipping actions are deliberately separate. `getRates` reads and
 * costs nothing; `buyLabel` spends money on a rate the user has already been
 * shown. Merging them would mean a single click spending on a price nobody
 * agreed to.
 */

type Kind = "contact" | "company";

const table = (kind: Kind) => (kind === "contact" ? "contacts" : "companies");

function assertKind(value: string): Kind {
  if (value !== "contact" && value !== "company") throw new Error("Unknown client type");
  return value;
}

// ----------------------------------------------------------- address ------

// Types only. A "use server" file may export nothing but async functions —
// anything else throws when the module loads, which the build does not catch.
// The form's initial state therefore lives in the component, not here.
export type AddressState = { status: "idle" | "saved" | "error"; message: string };

/**
 * Saves the mailing address. Returns a result rather than throwing so a failed
 * save shows a message on the form instead of replacing the client record with
 * an error screen.
 */
export async function saveAddress(
  _previous: AddressState,
  formData: FormData,
): Promise<AddressState> {
  const staff = await getStaffUser();
  if (!staff) return { status: "error", message: "Not authorized. Sign in again." };

  let kind: Kind;
  try {
    kind = assertKind(String(formData.get("kind") ?? ""));
  } catch {
    return { status: "error", message: "Unknown client type." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing client id." };

  const text = (name: string) => {
    const value = String(formData.get(name) ?? "").trim();
    return value === "" ? null : value.slice(0, 200);
  };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from(table(kind))
    .update({
      address_line1: text("address_line1"),
      address_line2: text("address_line2"),
      city: text("city"),
      state: text("state"),
      postal_code: text("postal_code"),
      country: text("country") ?? "US",
    })
    .eq("id", id);

  if (error) return { status: "error", message: `Could not save: ${error.message}` };

  revalidatePath(`/admin/clients/${kind}/${id}`);
  return { status: "saved", message: "Mailing address saved." };
}

// ---------------------------------------------------------- shipping ------

export type RateQuote =
  | { ok: true; shipmentId: string; rates: Rate[]; testMode: boolean }
  | { ok: false; error: string };

/** Read-only. Fetches rates so the user can choose one. Spends nothing. */
export async function getRates(input: {
  kind: string;
  id: string;
  length: number;
  width: number;
  height: number;
  weight: number;
}): Promise<RateQuote> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized" };

  const kind = assertKind(input.kind);

  for (const [label, value] of [
    ["Length", input.length],
    ["Width", input.width],
    ["Height", input.height],
    ["Weight", input.weight],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, error: `${label} must be greater than zero.` };
    }
  }

  const to = await recipientAddress(kind, input.id);
  if (!to.ok) return { ok: false, error: to.error };

  return quoteRates(to.address, {
    length: input.length,
    width: input.width,
    height: input.height,
    weight: input.weight,
  });
}

export type PurchaseOutcome =
  | { ok: true; labelUrl: string; trackingNumber: string; testMode: boolean }
  | { ok: false; error: string };

/**
 * SPENDS MONEY. Buys the chosen rate and records the shipment.
 *
 * The database row is written after the purchase succeeds, with a frozen copy
 * of the address that was printed. If the write fails the label still exists,
 * so the error says so explicitly rather than implying nothing happened.
 */
export async function buyLabel(input: {
  kind: string;
  id: string;
  /** The rate the user picked and confirmed, from a `getRates` result. */
  rate: Rate;
  reference: string;
  parcel: { length: number; width: number; height: number; weight: number };
}): Promise<PurchaseOutcome> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized" };

  const kind = assertKind(input.kind);
  if (!input.rate?.id) return { ok: false, error: "Choose a rate first." };

  const to = await recipientAddress(kind, input.id);
  if (!to.ok) return { ok: false, error: to.error };

  const purchase = await purchaseLabel(input.rate.id);
  if (!purchase.ok) return { ok: false, error: purchase.error };

  // Money is spent from here on. Record it, and if recording fails say that the
  // label exists anyway — silently losing a purchased label is worse than an
  // ugly error.
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("shipments").insert({
      contact_id: kind === "contact" ? input.id : null,
      company_id: kind === "company" ? input.id : null,
      status: "purchased",
      to_address: to.address,
      from_address: env.shipFrom,
      parcel: input.parcel,
      // The rate as quoted and shown to the person who confirmed it. Shippo's
      // own dashboard remains the financial source of truth — this is the
      // record of what TDR agreed to, reconcilable by `shippo_transaction_id`.
      carrier: input.rate.provider || null,
      service_level: input.rate.serviceLevel || null,
      rate_amount: Number.isFinite(input.rate.amount) ? input.rate.amount : null,
      rate_currency: input.rate.currency || "USD",
      estimated_days: input.rate.estimatedDays,
      tracking_number: purchase.trackingNumber || null,
      tracking_url: purchase.trackingUrl || null,
      label_url: purchase.labelUrl,
      shippo_transaction_id: purchase.transactionId || null,
      shippo_rate_id: input.rate.id,
      is_test: purchase.testMode,
      reference: input.reference.trim().slice(0, 300) || null,
      created_by: staff.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[shipping] Label bought but not recorded:", error);
    return {
      ok: false,
      error:
        `The label was purchased and is available at ${purchase.labelUrl} — but it could not be saved to the shipment history. ` +
        `Copy that link before leaving this page.`,
    };
  }

  revalidatePath(`/admin/clients/${kind}/${input.id}`);
  return {
    ok: true,
    labelUrl: purchase.labelUrl,
    trackingNumber: purchase.trackingNumber,
    testMode: purchase.testMode,
  };
}

/** Builds the destination address from the stored client record. */
async function recipientAddress(
  kind: Kind,
  id: string,
): Promise<{ ok: true; address: ShippoAddress } | { ok: false; error: string }> {
  const supabase = await supabaseServer();

  if (kind === "contact") {
    const { data } = await supabase
      .from("contacts")
      .select("first_name, last_name, phone, email, address_line1, address_line2, city, state, postal_code, country, company:companies(name)")
      .eq("id", id)
      .maybeSingle();
    if (!data) return { ok: false, error: "Client not found." };
    if (!data.address_line1 || !data.city || !data.state || !data.postal_code) {
      return { ok: false, error: "This client has no complete mailing address yet. Add one above first." };
    }
    const company = Array.isArray(data.company) ? data.company[0] : data.company;
    return {
      ok: true,
      address: {
        name: `${data.first_name} ${data.last_name}`.trim(),
        company: (company as { name?: string } | null)?.name || undefined,
        street1: data.address_line1,
        street2: data.address_line2 || undefined,
        city: data.city,
        state: data.state,
        zip: data.postal_code,
        country: data.country || "US",
        phone: data.phone || undefined,
        email: data.email || undefined,
      },
    };
  }

  const { data } = await supabase
    .from("companies")
    .select("name, phone, email, address_line1, address_line2, city, state, postal_code, country")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ok: false, error: "Client not found." };
  if (!data.address_line1 || !data.city || !data.state || !data.postal_code) {
    return { ok: false, error: "This client has no complete mailing address yet. Add one above first." };
  }
  return {
    ok: true,
    address: {
      name: data.name,
      company: data.name,
      street1: data.address_line1,
      street2: data.address_line2 || undefined,
      city: data.city,
      state: data.state,
      zip: data.postal_code,
      country: data.country || "US",
      phone: data.phone || undefined,
      email: data.email || undefined,
    },
  };
}
