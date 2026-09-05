/**
 * Contract tests for the Shippo client (src/lib/shipping/shippo.ts).
 *
 *   npm run check:shipping
 *
 * `fetch` is stubbed, so this never touches the network and never spends
 * money. What it pins down is the part that is easy to get quietly wrong:
 * every failure mode must come back as a result object carrying a message a
 * person can act on. A carrier outage, a rejected token or an undeliverable
 * address must not throw — throwing turns a shipping problem into a 500 on the
 * client record.
 *
 * This is NOT proof that the request shape is right. The environment this was
 * written in cannot reach api.goshippo.com, so the shapes below are the
 * documented ones, not observed ones. Buy one label with a `shippo_test_`
 * token before trusting it with a real shipment (docs/SHIPPING.md).
 */

process.env.SHIPPO_API_TOKEN = "shippo_test_abc123";
process.env.SHIP_FROM_NAME = "TDR Engineering";
process.env.SHIP_FROM_STREET1 = "100 Survey Way";
process.env.SHIP_FROM_CITY = "Los Angeles";
process.env.SHIP_FROM_STATE = "CA";
process.env.SHIP_FROM_ZIP = "90065";

type Json = Record<string, unknown>;

let captured: { url: string; init: RequestInit } | null = null;
let scenario = "rates";
let failures = 0;

const responses: Record<string, () => Response> = {
  rates: () =>
    json({
      object_id: "shp_1",
      rates: [
        // Deliberately not in price order — the client must sort them.
        {
          object_id: "rate_fast",
          provider: "UPS",
          servicelevel: { name: "2nd Day Air" },
          amount: "24.10",
          currency: "USD",
          estimated_days: 2,
        },
        {
          object_id: "rate_slow",
          provider: "USPS",
          servicelevel: { name: "Ground Advantage" },
          amount: "7.20",
          currency: "USD",
          estimated_days: 5,
        },
      ],
    }),
  norates: () =>
    json({
      object_id: "shp_2",
      rates: [],
      messages: [{ source: "USPS", text: "Address not found" }],
    }),
  buy: () =>
    json({
      object_id: "txn_1",
      status: "SUCCESS",
      label_url: "https://shippo/label.pdf",
      tracking_number: "9400111899",
      tracking_url_provider: "https://usps/track",
    }),
  buyfail: () => json({ object_id: "txn_2", status: "ERROR", messages: [{ text: "Insufficient funds" }] }),
  nolabel: () => json({ object_id: "txn_3", status: "SUCCESS", label_url: "" }),
  unauthorized: () => json({ detail: "Invalid token" }, 401),
  validation: () => json({ address_to: ["Enter a valid zip"] }, 400),
  unreadable: () => new Response("<html>502</html>", { status: 502 }),
};

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  captured = { url: String(url), init: init ?? {} };
  if (scenario === "throw") throw new Error("dns fail");
  return (responses[scenario] ?? (() => json({})))();
}) as typeof fetch;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${label}` +
      (ok ? `  →  ${JSON.stringify(actual)}` : `\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`),
  );
}

async function main() {
  const { quoteRates, purchaseLabel } = await import("../src/lib/shipping/shippo.js");

  const to = {
    name: "Dans Arch",
    street1: "1200 Design Ave",
    city: "Pasadena",
    state: "CA",
    zip: "91101",
    country: "US",
  };
  const parcel = { length: 12, width: 9, height: 2, weight: 1.5 };

  console.log("\nQuoting rates (reads only, spends nothing)");
  const quote = await quoteRates(to, parcel);
  const sent = JSON.parse(String(captured!.init.body));

  // Shippo authenticates with its own scheme, not Bearer. Getting this wrong
  // is a 401 on every call.
  check("auth header uses the ShippoToken scheme",
    (captured!.init.headers as Record<string, string>).Authorization,
    "ShippoToken shippo_test_abc123");
  check("posts to the shipments endpoint", captured!.url, "https://api.goshippo.com/shipments/");
  check("declares imperial units", [sent.parcels[0].distance_unit, sent.parcels[0].mass_unit], ["in", "lb"]);
  check("asks for rates synchronously", sent.async, false);
  check("quote succeeded", quote.ok, true);

  if (quote.ok) {
    // The cheapest option has to be first — it is what a hurried person picks.
    check("rates sorted cheapest first",
      quote.rates.map((r) => `${r.provider} ${r.serviceLevel} ${r.amount}`),
      ["USPS Ground Advantage 7.2", "UPS 2nd Day Air 24.1"]);
    check("test token reported as test mode", quote.testMode, true);
  }

  console.log("\nFailure modes — every one must be a message, not a throw");

  scenario = "norates";
  // Shippo reports an undeliverable address as a message with a 200, not an error.
  check("no rates surfaces the carrier's own reason", await quoteRates(to, parcel),
    { ok: false, error: "No rates available — USPS: Address not found" });

  scenario = "validation";
  check("field validation names the field", await quoteRates(to, parcel),
    { ok: false, error: "address_to: Enter a valid zip" });

  scenario = "unauthorized";
  check("rejected token names the variable to fix", await purchaseLabel("rate_slow"),
    { ok: false, error: "The Shippo API token was rejected. Check SHIPPO_API_TOKEN." });

  scenario = "buyfail";
  check("carrier refusal is passed through", await purchaseLabel("rate_slow"),
    { ok: false, error: "Insufficient funds" });

  scenario = "nolabel";
  // Reported success with nothing to print is a failure, not a purchase.
  check("success with no label is a failure", await purchaseLabel("rate_slow"),
    { ok: false, error: "The provider reported success but returned no label to print." });

  scenario = "unreadable";
  check("non-JSON response does not throw", await purchaseLabel("rate_slow"),
    { ok: false, error: "Shipping provider returned an unreadable response (502)." });

  scenario = "throw";
  // The wording matters: after a network failure the user must know no money moved.
  check("network failure says the label was not purchased", await purchaseLabel("rate_slow"),
    { ok: false, error: "Could not reach the shipping provider. The label was not purchased." });

  check("empty rate id is refused before any request", await purchaseLabel(""),
    { ok: false, error: "No rate selected." });

  console.log("\nBuying a chosen rate");
  scenario = "buy";
  const purchase = await purchaseLabel("rate_slow");
  check("buys the rate it was given", JSON.parse(String(captured!.init.body)).rate, "rate_slow");
  check("posts to the transactions endpoint", captured!.url, "https://api.goshippo.com/transactions/");
  check("returns a printable label and tracking",
    purchase.ok ? [purchase.labelUrl, purchase.trackingNumber, purchase.testMode] : purchase,
    ["https://shippo/label.pdf", "9400111899", true]);

  console.log(
    failures === 0
      ? "\nAll shipping contract checks passed.\n"
      : `\n${failures} shipping contract check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("check:shipping crashed:", error);
  process.exit(1);
});
