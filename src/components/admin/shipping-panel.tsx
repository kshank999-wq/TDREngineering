"use client";

import { useState } from "react";
import { getRates, buyLabel } from "@/app/admin/clients/[kind]/[id]/actions";
import type { Rate } from "@/lib/shipping/shippo";

/**
 * Quote-then-buy shipping flow.
 *
 * Three states, and the order is the safety property:
 *   parcel  → enter dimensions and weight, fetch rates (costs nothing)
 *   rates   → see every rate with its price, pick one, confirm
 *   done    → label ready to print
 *
 * The confirm step is not ceremony. Buying a label charges the Shippo account,
 * so the price and carrier are restated immediately next to the button that
 * spends it.
 */

type Props = {
  kind: string;
  id: string;
  hasAddress: boolean;
  configured: boolean;
  testMode: boolean;
};

const PRESETS = [
  { label: "Document envelope", length: 12.5, width: 9.5, height: 0.5, weight: 0.5 },
  { label: "Plan tube", length: 26, width: 4, height: 4, weight: 2 },
  { label: "Small box — prints", length: 12, width: 9, height: 3, weight: 3 },
  { label: "Drive / media", length: 9, width: 6, height: 2, weight: 1 },
];

export function ShippingPanel({ kind, id, hasAddress, configured, testMode }: Props) {
  const [parcel, setParcel] = useState({ length: 12.5, width: 9.5, height: 0.5, weight: 0.5 });
  const [reference, setReference] = useState("");
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [chosen, setChosen] = useState<Rate | null>(null);
  const [busy, setBusy] = useState<"quote" | "buy" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ labelUrl: string; trackingNumber: string } | null>(null);

  if (!configured) {
    return (
      <p className="text-sm text-ink-500">
        Shipping is not configured for this deployment. Set{" "}
        <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">SHIPPO_API_TOKEN</code> and the{" "}
        <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">SHIP_FROM_*</code> variables.
      </p>
    );
  }

  if (!hasAddress) {
    return (
      <p className="text-sm text-ink-500">
        Add a complete mailing address above before creating a label.
      </p>
    );
  }

  const num = (key: keyof typeof parcel) => (value: string) =>
    setParcel((p) => ({ ...p, [key]: value === "" ? 0 : Number(value) }));

  async function onQuote() {
    setBusy("quote");
    setError("");
    setChosen(null);
    try {
      const result = await getRates({ kind, id, ...parcel });
      if (!result.ok) setError(result.error);
      else setRates(result.rates);
    } catch {
      setError("Could not fetch rates. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onBuy() {
    if (!chosen) return;
    setBusy("buy");
    setError("");
    try {
      const result = await buyLabel({ kind, id, rate: chosen, reference, parcel });
      if (!result.ok) setError(result.error);
      else setDone({ labelUrl: result.labelUrl, trackingNumber: result.trackingNumber });
    } catch {
      setError("The purchase did not complete. Check the shipment history before retrying.");
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5">
        <p className="text-sm font-semibold text-emerald-900">
          Label purchased{testMode ? " (test mode — not real postage)" : ""}
        </p>
        {done.trackingNumber ? (
          <p className="mt-1 font-mono text-xs text-emerald-800">{done.trackingNumber}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={done.labelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
          >
            Open label to print
          </a>
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setRates(null);
              setChosen(null);
              setReference("");
            }}
            className="rounded-md border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50"
          >
            Ship something else
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {testMode ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Test mode — labels bought here are not real postage and will not ship.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Common parcels
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setParcel({
                  length: preset.length,
                  width: preset.width,
                  height: preset.height,
                  weight: preset.weight,
                });
                setRates(null);
                setChosen(null);
              }}
              className="rounded-full border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["length", "Length (in)"],
            ["width", "Width (in)"],
            ["height", "Height (in)"],
            ["weight", "Weight (lb)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              {label}
            </span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={parcel[key] || ""}
              onChange={(e) => num(key)(e.target.value)}
              className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            />
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Reference (optional)
        </span>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. signed ALTA + 2 prints, job TDR-2026-01003"
          className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={onQuote}
        disabled={busy !== null}
        className="rounded-md border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60"
      >
        {busy === "quote" ? "Getting rates…" : rates ? "Refresh rates" : "Get rates"}
      </button>

      {rates ? (
        <div className="border-t border-ink-100 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            {rates.length} rate{rates.length === 1 ? "" : "s"} — cheapest first
          </p>
          <ul className="mt-3 space-y-2">
            {rates.map((rate) => (
              <li key={rate.id}>
                <label
                  className={`flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3 transition-colors ${
                    chosen?.id === rate.id
                      ? "border-brand-500 bg-brand-600/5 ring-1 ring-brand-500"
                      : "border-ink-200 hover:border-ink-300"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="rate"
                      checked={chosen?.id === rate.id}
                      onChange={() => setChosen(rate)}
                      className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink-900">
                        {rate.provider} · {rate.serviceLevel}
                      </span>
                      <span className="block text-xs text-ink-500">
                        {rate.estimatedDays !== null
                          ? `about ${rate.estimatedDays} day${rate.estimatedDays === 1 ? "" : "s"}`
                          : rate.durationTerms || "delivery estimate unavailable"}
                      </span>
                    </span>
                  </span>
                  <span className="font-mono text-sm font-semibold text-ink-900 tabular-nums">
                    ${rate.amount.toFixed(2)}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {chosen ? (
            <div className="mt-5 rounded-lg border border-ink-200 bg-ink-50 p-4">
              {/* The price is restated next to the button that spends it. */}
              <p className="text-sm text-ink-800">
                Buy <strong>{chosen.provider} {chosen.serviceLevel}</strong> for{" "}
                <strong className="font-mono">${chosen.amount.toFixed(2)}</strong>
                {testMode ? " in test mode" : ", charged to the TDR Shippo account"}.
              </p>
              <button
                type="button"
                onClick={onBuy}
                disabled={busy !== null}
                className="mt-3 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
              >
                {busy === "buy" ? "Purchasing…" : `Buy label — $${chosen.amount.toFixed(2)}`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
