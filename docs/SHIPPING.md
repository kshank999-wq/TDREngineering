# Shipping labels

Printing a shipping label from a client record, using Shippo.

This is not part of the Phase 1 spec. It was added because TDR mails
deliverables — signed drawings, plan sets, drives — to the same clients that
are already in this database, and re-typing an address into a carrier website
is both slower and a way to mail a plan tube to the wrong street.

---

## What it does

`/admin/clients` lists every person and firm in the database, searchable in one
box. Clicking a name opens the client record, which shows:

- how to reach them,
- their **mailing address** (editable in place),
- every proposal request they have made,
- every job they have referred to TDR,
- the people at the firm, if it is a company,
- every label ever bought for them,

and, in the right-hand column, the **Ship to this client** panel.

## The mailing address is not the project address

They are different columns on different tables, deliberately.

| | Where it lives | What it is |
|---|---|---|
| Mailing address | `contacts` / `companies` | Where deliverables get mailed — usually an office |
| Project address | `properties` | The lot being surveyed |

A survey is performed on a lot; the plans go to an office. Storing one and
using it for the other mails a tube of drawings to an empty field. The shipping
panel only ever reads the mailing address, and refuses to quote until street,
city, state and ZIP are all present.

## Buying a label spends money

The flow is two steps and must stay two steps:

1. **Get rates** — creates a shipment at Shippo and returns every rate with its
   price. Reads only. Costs nothing, commits to nothing.
2. **Buy label** — buys the one rate the user picked. This charges the TDR
   Shippo account.

The carrier and price are restated on the button that spends the money. There
is no "just ship it" button that chooses a rate for you, and there should never
be one: it would spend on a price nobody agreed to.

### Test mode

A Shippo token beginning `shippo_test_` buys test labels. They are not real
postage and will not move a parcel. The panel shows an amber banner whenever
the configured token is a test token, the success screen says so, and every
shipment row is stored with `is_test = true` and shown with a `test` chip.

**Buy the first label in test mode.** The Shippo request shape in
`src/lib/shipping/shippo.ts` was written against Shippo's documented v1 REST
API but could not be exercised against the live API from the environment it was
built in — outbound access to `api.goshippo.com` is blocked there. The module
is unit-tested against stubbed responses for all of its failure modes, which is
not the same as having seen a real one. Check the rate list and the label PDF
once with a test token before trusting it with a real shipment.

---

## Setup

### 1. Apply the migration

In the Supabase SQL editor, paste and run:

```
supabase/migrations/0003_shipping.sql
```

It is idempotent — running it twice is safe. Until it is applied, the Shipments
panel on a client record says so rather than showing an empty history.

It adds:

- mailing address columns on `contacts` and `companies`,
- the `shipments` audit table (RLS on, staff read + update),
- `v_client_directory`, the view the client list searches.

### 2. Set the environment variables in Vercel

Project → Settings → Environment Variables. All of these are **server-side**;
none of them is `NEXT_PUBLIC_`.

| Variable | Value |
|---|---|
| `SHIPPO_API_TOKEN` | From Shippo → Settings → API. Start with the **test** token. |
| `SHIP_FROM_NAME` | `TDR Engineering` |
| `SHIP_FROM_STREET1` | TDR's street address |
| `SHIP_FROM_STREET2` | Suite, if any |
| `SHIP_FROM_CITY` | |
| `SHIP_FROM_STATE` | Two letters |
| `SHIP_FROM_ZIP` | |
| `SHIP_FROM_COUNTRY` | `US` |
| `SHIP_FROM_PHONE` | Carrier contact for the shipment |
| `SHIP_FROM_EMAIL` | Carrier contact for the shipment |

Redeploy after saving — environment variables are read at build and run time,
and an existing deployment will not pick them up.

Rates cannot be quoted without a complete origin address, so the panel says
"Shipping is not configured" until `SHIPPO_API_TOKEN` plus street, city, state
and ZIP are all set.

### 3. Verify

1. Open `/admin/clients`, find a client, open the record.
2. Fill in a real mailing address and save.
3. **Get rates.** A list of carriers and prices should come back, cheapest
   first. If it does not, the error says why — a rejected token, an
   undeliverable address, a carrier message.
4. Pick one and buy it **with the test token still set**. The label opens as a
   PDF.
5. Check the Shipments panel on the client record now lists it with a `test`
   chip.

Only then swap `SHIPPO_API_TOKEN` for the live token and redeploy.

---

## When something goes wrong

Every failure surfaces as a message in the admin, never a 500 — the same
contract the transactional-email module follows.

**"The label was purchased and is available at … but it could not be saved to
the shipment history."** The money was spent and the label exists. Copy that
link before leaving the page; the shipment will not appear in the history.
Nothing about the purchase can be undone by reloading. This happens only if the
database write fails after a successful carrier purchase.

**"The provider reported success but returned no label to print."** Nothing
usable came back. Check the Shippo dashboard before retrying — the transaction
may exist there.

**"The Shippo API token was rejected."** `SHIPPO_API_TOKEN` is wrong, or the
deployment predates the variable being set. Redeploy.

**"No rates available — …"** Shippo reports undeliverable addresses as messages
rather than HTTP errors. The text after the dash is the carrier's own reason;
it is usually the recipient address.

Refunding or voiding a label is done in the Shippo dashboard. The `shipments`
row keeps `shippo_transaction_id` so a shipment can be reconciled against it;
the `refunded` status exists in the schema but nothing sets it yet.

## What is not built

- No refund or void from the admin — use the Shippo dashboard.
- No address validation before purchase beyond "all four fields present".
  Shippo validates at quote time and reports it as a message.
- No return labels, customs forms, or international shipping. The origin
  defaults to `US` and the parcel presets are domestic.
- Shipments are not linked to a specific proposal yet. The column
  (`opportunity_id`) exists and is indexed; nothing writes it.
