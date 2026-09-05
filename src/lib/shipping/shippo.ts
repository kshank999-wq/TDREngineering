import "server-only";
import { env, isShippoTestMode } from "@/lib/env";

/**
 * Shippo client for printing shipping labels from client records.
 *
 * Mirrors the transactional-email module's contract deliberately: every call
 * resolves to a result object and nothing throws, so a carrier outage surfaces
 * as a message in the admin rather than a 500.
 *
 * IMPORTANT — buying a label spends money. The flow is therefore split in two:
 *
 *   quoteRates()    reads only. Creates a Shippo shipment and returns rates.
 *                   Costs nothing, commits to nothing.
 *   purchaseLabel() spends. Buys a specific rate the user has seen and chosen.
 *
 * Never collapse these into one call. A single "ship it" button that picks a
 * rate for you spends the client's money on a price they never agreed to.
 *
 * NOTE ON VERIFICATION: this is written against Shippo's documented v1 REST
 * API. The environment this was built in cannot reach api.goshippo.com, so no
 * live request/response pair was observed. Run one label in test mode
 * (a `shippo_test_` token) and check the rate list and label URL before
 * trusting it with a real shipment.
 */

const SHIPPO_BASE = "https://api.goshippo.com";

export type ShippoAddress = {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
};

export type Parcel = {
  /** Inches. */
  length: number;
  width: number;
  height: number;
  /** Pounds. */
  weight: number;
};

export type Rate = {
  id: string;
  provider: string;
  serviceLevel: string;
  amount: number;
  currency: string;
  estimatedDays: number | null;
  durationTerms: string | null;
};

export type QuoteResult =
  | { ok: true; shipmentId: string; rates: Rate[]; testMode: boolean }
  | { ok: false; error: string };

export type PurchaseResult =
  | {
      ok: true;
      transactionId: string;
      labelUrl: string;
      trackingNumber: string;
      trackingUrl: string;
      testMode: boolean;
    }
  | { ok: false; error: string };

async function shippoFetch(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  if (!env.shippoToken) {
    return { ok: false, error: "Shipping is not configured (SHIPPO_API_TOKEN is unset)." };
  }
  try {
    const response = await fetch(`${SHIPPO_BASE}${path}`, {
      method: "POST",
      headers: {
        // Shippo uses its own scheme here, not Bearer.
        Authorization: `ShippoToken ${env.shippoToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, error: `Shipping provider returned an unreadable response (${response.status}).` };
    }

    if (!response.ok) {
      console.error(`[shipping] Shippo ${path} responded ${response.status}: ${text.slice(0, 500)}`);
      return { ok: false, error: describeError(response.status, data) };
    }
    return { ok: true, data };
  } catch (error) {
    console.error(`[shipping] Shippo ${path} failed:`, error);
    return {
      ok: false,
      error: "Could not reach the shipping provider. The label was not purchased.",
    };
  }
}

/** Turns a provider error into something a person can act on. */
function describeError(status: number, data: Record<string, unknown>): string {
  if (status === 401) return "The Shippo API token was rejected. Check SHIPPO_API_TOKEN.";
  if (status === 429) return "Shippo is rate limiting. Wait a moment and try again.";

  // Shippo returns field-keyed validation errors, e.g. {address_to: ["..."]}.
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      parts.push(`${key}: ${value.join("; ")}`);
    } else if (typeof value === "string" && key !== "object_id") {
      parts.push(value);
    }
  }
  return parts.length > 0
    ? parts.join(" · ").slice(0, 400)
    : `Shipping provider responded ${status}.`;
}

/**
 * Fetch rates for a parcel going from the configured origin to `to`.
 * Read-only — nothing is bought.
 */
export async function quoteRates(to: ShippoAddress, parcel: Parcel): Promise<QuoteResult> {
  const from = env.shipFrom;
  if (!from.street1 || !from.city || !from.state || !from.zip) {
    return { ok: false, error: "No shipping origin configured. Set the SHIP_FROM_* variables." };
  }

  const result = await shippoFetch("/shipments/", {
    address_from: {
      name: from.name,
      street1: from.street1,
      street2: from.street2 || undefined,
      city: from.city,
      state: from.state,
      zip: from.zip,
      country: from.country,
      phone: from.phone || undefined,
      email: from.email || undefined,
    },
    address_to: {
      name: to.name,
      company: to.company || undefined,
      street1: to.street1,
      street2: to.street2 || undefined,
      city: to.city,
      state: to.state,
      zip: to.zip,
      country: to.country,
      phone: to.phone || undefined,
      email: to.email || undefined,
    },
    parcels: [
      {
        length: String(parcel.length),
        width: String(parcel.width),
        height: String(parcel.height),
        distance_unit: "in",
        weight: String(parcel.weight),
        mass_unit: "lb",
      },
    ],
    // Synchronous: rates come back on this response rather than by polling.
    async: false,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const raw = Array.isArray(result.data.rates) ? result.data.rates : [];
  const rates: Rate[] = raw
    .map((r) => {
      const rate = r as Record<string, unknown>;
      const service = (rate.servicelevel ?? {}) as Record<string, unknown>;
      const amount = Number(rate.amount);
      if (!rate.object_id || Number.isNaN(amount)) return null;
      return {
        id: String(rate.object_id),
        provider: String(rate.provider ?? "Unknown carrier"),
        serviceLevel: String(service.name ?? "Unknown service"),
        amount,
        currency: String(rate.currency ?? "USD"),
        estimatedDays:
          rate.estimated_days === null || rate.estimated_days === undefined
            ? null
            : Number(rate.estimated_days),
        durationTerms: rate.duration_terms ? String(rate.duration_terms) : null,
      };
    })
    .filter((r): r is Rate => r !== null)
    .sort((a, b) => a.amount - b.amount);

  if (rates.length === 0) {
    // Shippo reports unusable addresses as messages rather than an HTTP error.
    const messages = Array.isArray(result.data.messages) ? result.data.messages : [];
    const detail = messages
      .map((m) => {
        const msg = m as Record<string, unknown>;
        return [msg.source, msg.text].filter(Boolean).join(": ");
      })
      .filter(Boolean)
      .join(" · ");
    return {
      ok: false,
      error: detail
        ? `No rates available — ${detail}`
        : "No rates came back for that address and parcel. Check the address is deliverable.",
    };
  }

  return {
    ok: true,
    shipmentId: String(result.data.object_id ?? ""),
    rates,
    testMode: isShippoTestMode(),
  };
}

/**
 * Buy a specific rate. THIS SPENDS MONEY (unless the token is a test token).
 * `rateId` must come from a `quoteRates` result the user has actually seen.
 */
export async function purchaseLabel(rateId: string): Promise<PurchaseResult> {
  if (!rateId) return { ok: false, error: "No rate selected." };

  const result = await shippoFetch("/transactions/", {
    rate: rateId,
    label_file_type: "PDF_4x6",
    async: false,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const data = result.data;
  const status = String(data.status ?? "").toUpperCase();

  if (status !== "SUCCESS") {
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const detail = messages
      .map((m) => String((m as Record<string, unknown>).text ?? ""))
      .filter(Boolean)
      .join(" · ");
    return {
      ok: false,
      error: detail || `The carrier did not issue a label (status ${status || "unknown"}).`,
    };
  }

  const labelUrl = String(data.label_url ?? "");
  if (!labelUrl) {
    // Reported success with nothing to print — say so rather than recording a
    // purchase the user cannot use.
    return { ok: false, error: "The provider reported success but returned no label to print." };
  }

  return {
    ok: true,
    transactionId: String(data.object_id ?? ""),
    labelUrl,
    trackingNumber: String(data.tracking_number ?? ""),
    trackingUrl: String(data.tracking_url_provider ?? ""),
    testMode: isShippoTestMode(),
  };
}
