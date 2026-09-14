# Phase 1 Definition of Done

**Spec §22**, with the current status of each item.

Legend: ✅ **verified working in production** · 🔨 built and tested locally,
not yet exercised against production · ⚙️ built, waiting on TDR content or
configuration · 👤 operational task outside this repository

Last updated 14 September 2026. Every criterion that could be satisfied by
writing code has been. What remains is content, configuration, one operational
run, and the cutover itself.

| # | Criterion | Status | Notes |
| --- | --- | --- | --- |
| 1 | Existing TDR website independently archived and inventoried | ⚙️ | Crawler built and **verified end to end against a fixture**; not yet run against the live site. TDR has Network Solutions access, so downloading the site's actual files is now the better route and the crawl is the fallback. Hand-off sheet: [Archive TDREngineering.com](https://claude.ai/code/artifact/80d6f3aa-e050-4c93-876e-084eb60eeead); `docs/PHASE-1A-ARCHIVE.md` |
| 2 | TDR controls GitHub, Vercel, Supabase, DNS and production credentials | 👤 | Mostly done. GitHub, Vercel, Supabase and Resend exist under TDR; **domain, DNS and email are under TDR's own Network Solutions account** (confirmed 14 Sep). Outstanding: analytics, and the second-administrator requirement on each account. [Control sheet](https://claude.ai/code/artifact/e04633af-8b13-463e-9c32-d89f23f19fa3); `docs/OWNERSHIP-AND-ACCOUNTS.md` |
| 3 | New homepage and primary service pages are operational | ✅ | Homepage plus 24 generated service pages, `/3d-scanning`, `/about`, `/projects`, `/questions`, `/contact` |
| 4 | Promotional hero presentation is operational | ⚙️ | Hero implemented with video + poster + rotating overlay messages; renders an animated reality-capture graphic until TDR supplies footage. Set `heroMedia` in `src/content/site.ts` |
| 5 | 3D scanning / technology advantage is prominently presented | ✅ | Hero, homepage value proposition, "Why TDR" pillars, and a dedicated `/3d-scanning` page |
| 6 | "Does Your Survey Look Like This?" concept is implemented | ⚙️ | Interactive draggable comparison built and keyboard-accessible; schematic panels must be replaced with approved real deliverable imagery |
| 7 | Request a Proposal works without requiring a login | ✅ | **Verified in production**, including file upload, conditional questions and referral capture |
| 8 | Proposal requests persist in Supabase | ✅ | **Verified in production.** Two real submissions stored (`TDR-2026-01000`, `TDR-2026-01002`), including one where both emails failed and the request was preserved regardless — spec §9's rule holding under a real failure |
| 9 | Referral source and referral-company relationships are captured | ✅ | **Verified in production.** A live submission produced distinct client, property, referring person and referring company records — spec §8's separation confirmed against real data, not fixtures |
| 10 | TDR receives proposal notifications and prospects receive confirmations | ⚙️ | **The only functional gap left, and unverified since.** The last production test failed twice: `RESEND_API_KEY` rejected with 401 *API key is invalid*, and `PROPOSAL_NOTIFICATION_TO` unset. Both are Vercel environment values, not code — the Resend request shape is verified correct. Check the Resend dashboard log to see whether it is still failing. Proposal requests are stored regardless (spec §9) |
| 11 | Basic protected internal proposal view works | ✅ | **Verified in production.** Signed in as an owner, listed and opened a real request. Four usability defects found by using it and fixed: buried status control, no login entry point, marketing chrome on internal pages, raw field names in service details |
| 12 | Existing `@tdrengineering.com` email addresses continue functioning | 👤 | `docs/EMAIL-MIGRATION.md` |
| 13 | Email service is controlled by TDR, not the previous developer | 👤 | Email is hosted under TDR's own Network Solutions account (confirmed 14 Sep). Still needs a second administrator. `docs/OWNERSHIP-AND-ACCOUNTS.md` + `docs/EMAIL-MIGRATION.md` |
| 14 | Spam, phishing, SPF, DKIM and DMARC configured appropriately | 👤 | Full procedure incl. conservative DMARC ramp in `docs/EMAIL-MIGRATION.md` §3 |
| 15 | Important legacy URLs redirect to relevant new pages | ⚙️ | 301 redirect infrastructure built with common aliases seeded; verified legacy URLs must be added from the Phase 1A inventory |
| 16 | Website works on desktop, tablet and mobile | 🔨 | No horizontal overflow on any of the 10 public pages at 390px, verified in a real browser. Still needs QA on physical iOS and Android devices — `docs/SEO-AND-LAUNCH.md` |
| 17 | Backups and recovery procedures are documented | ✅ | `docs/BACKUP-AND-RECOVERY.md`, including a quarterly restore drill |
| 18 | Production site is live | 👤 | Cutover sequence in `docs/SEO-AND-LAUNCH.md` and `docs/DEPLOYMENT.md` §4 |

---

## Infrastructure — done

Stood up and verified in production on 2–3 September 2026:

* **Supabase** — migrations `0001`–`0005` applied, 14 tables, 27 seeded
  services, 10 referral sources, **RLS enabled on every table** (confirmed by
  query), private attachment bucket, two TDR-controlled owner accounts. Every
  `SECURITY DEFINER` function is revoked from `anon` and checks `is_staff()`
  itself (`0005`); Supabase's security advisor reports no anon-executable
  findings.
* **Vercel** — project on `main`, environment variables set, CI green on every
  push, production serving at `tdr-engineering.vercel.app`.
* **The full path** — public form → validation → Supabase writes → storage
  upload → internal proposal view, exercised with real submissions.

## What blocks launch

Still none of it code:

1. **Finish transactional email** (#10) — replace the invalid Resend API key and
   set `PROPOSAL_NOTIFICATION_TO`. This is the only thing on the site that does
   not work. Until it is fixed a real prospect gets no confirmation and nobody
   at TDR is told a request arrived; the request itself is still safely stored.
2. **Capture the legacy site** and complete the inventory (#1), then populate
   the redirect map from it (#15). Everything about preserving search rankings
   depends on this.
3. **Supply the content** — contact details, hero footage, survey comparison
   imagery, real project examples (#4, #6). `npm run check:content`.
4. **Finish account ownership** (#2, #13) — analytics, and a second
   administrator on every account so no single person can be locked out.
5. **QA on physical devices** (#16) and run the cutover (#18).

Everything marked ⚙️ beyond those improves the site but does not stop it going
live. The placeholders are honest rather than broken: the hero animates, the
comparison works, the pages read as complete.

Run `npm run check:content` for the current list, and see
`docs/CONTENT-REQUIRED.md` for exactly what to supply. Unverified business
facts are stored as empty strings and omitted at render rather than printed, so
a premature deploy is safe — but not launch-ready, which
`npm run check:content -- --strict` is what enforces.

---

## Built after the spec

Requested during Phase 1 and delivered outside its scope, because using the
system is what surfaced the need:

* **Shipping labels** from a client record, via Shippo — quote-then-buy, with
  an audit table recording every label. `docs/SHIPPING.md`
* **Client directory and client records** — one searchable list of people and
  firms, with mailing addresses, proposal history and referral history.
* **Duplicate merging** — candidate detection plus an atomic merge that moves
  every reference and archives, never deletes. `docs/MERGING-CLIENTS.md`
* **Database hardening** — least privilege on every `SECURITY DEFINER`
  function (`0004`, `0005`).

The first three are Phase 2 work already begun; they are noted here so a later
spec does not re-specify them.

## Out of scope for Phase 1

Per spec §17, none of the following may delay launch: full CRM · full project
management · full employee dashboard · client portal · NAS integration ·
marketing automation · newsletter campaign engine · prospecting engine ·
QuickBooks API integration · Accountrix Plus integration · AI customer
assistant · full financial dashboard · full project document-management
platform.

`docs/ARCHITECTURE.md` records how each of these attaches to what has been built,
so the later work extends the model rather than replacing it.
