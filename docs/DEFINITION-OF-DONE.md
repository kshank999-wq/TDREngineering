# Phase 1 Definition of Done

**Spec §22**, with the current status of each item.

Legend: ✅ built and verified · ⚙️ built, needs TDR action or real content ·
👤 TDR/operational task, outside this repository

| # | Criterion | Status | Notes |
| --- | --- | --- | --- |
| 1 | Existing TDR website independently archived and inventoried | ⚙️ | Crawler built (`npm run archive:crawl`); must be **run against the live legacy site** and the output stored in TDR storage. `docs/PHASE-1A-ARCHIVE.md` |
| 2 | TDR controls GitHub, Vercel, Supabase, DNS and production credentials | 👤 | Checklist and verification procedure in `docs/OWNERSHIP-AND-ACCOUNTS.md`, with an interactive/printable [control sheet](https://claude.ai/code/artifact/e04633af-8b13-463e-9c32-d89f23f19fa3) |
| 3 | New homepage and primary service pages are operational | ✅ | Homepage plus 24 generated service pages, `/3d-scanning`, `/about`, `/projects`, `/questions`, `/contact` |
| 4 | Promotional hero presentation is operational | ⚙️ | Hero implemented with video + poster + rotating overlay messages; renders an animated reality-capture graphic until TDR supplies footage. Set `heroMedia` in `src/content/site.ts` |
| 5 | 3D scanning / technology advantage is prominently presented | ✅ | Hero, homepage value proposition, "Why TDR" pillars, and a dedicated `/3d-scanning` page |
| 6 | "Does Your Survey Look Like This?" concept is implemented | ⚙️ | Interactive draggable comparison built and keyboard-accessible; schematic panels must be replaced with approved real deliverable imagery |
| 7 | Request a Proposal works without requiring a login | ✅ | `/request-a-proposal` — no auth anywhere in the path |
| 8 | Proposal requests persist in Supabase | ✅ | Database write completes before any email; email failure never loses the request |
| 9 | Referral source and referral-company relationships are captured | ✅ | `referrals` table links opportunity → referring contact → referring company, with raw values preserved |
| 10 | TDR receives proposal notifications and prospects receive confirmations | ⚙️ | Both implemented; needs a transactional email provider configured (`docs/DEPLOYMENT.md` §2) |
| 11 | Basic protected internal proposal view works | ✅ | `/admin` — list, search, status filter, detail, status change, internal notes, signed attachment downloads, CSV export |
| 12 | Existing `@tdrengineering.com` email addresses continue functioning | 👤 | `docs/EMAIL-MIGRATION.md` |
| 13 | Email service is controlled by TDR, not the previous developer | 👤 | `docs/OWNERSHIP-AND-ACCOUNTS.md` + `docs/EMAIL-MIGRATION.md` |
| 14 | Spam, phishing, SPF, DKIM and DMARC configured appropriately | 👤 | Full procedure incl. conservative DMARC ramp in `docs/EMAIL-MIGRATION.md` §3 |
| 15 | Important legacy URLs redirect to relevant new pages | ⚙️ | 301 redirect infrastructure built with common aliases seeded; verified legacy URLs must be added from the Phase 1A inventory |
| 16 | Website works on desktop, tablet and mobile | ✅ | Responsive throughout; device QA checklist in `docs/SEO-AND-LAUNCH.md` |
| 17 | Backups and recovery procedures are documented | ✅ | `docs/BACKUP-AND-RECOVERY.md`, including a quarterly restore drill |
| 18 | Production site is live | 👤 | Cutover sequence in `docs/SEO-AND-LAUNCH.md` and `docs/DEPLOYMENT.md` §4 |

---

## What blocks launch

Only three things are genuinely blocking, and none of them is code:

1. **Run the archive** against the live legacy site and complete the inventory
   (#1). Everything about redirects depends on it, and the window closes the
   moment DNS moves.
2. **Take ownership** of every account in `docs/OWNERSHIP-AND-ACCOUNTS.md` (#2,
   #13). This is the outcome Phase 1 exists to produce.
3. **Configure production services** — Supabase, transactional email, Turnstile,
   analytics (#10).

Everything marked ⚙️ beyond those is content that improves the site but does not
stop it going live. The placeholders are honest rather than broken: the hero
animates, the comparison works, the pages read as complete.

Run `npm run check:content` for the current list, and see
`docs/CONTENT-REQUIRED.md` for exactly what to supply. Unverified business
facts are stored as empty strings and omitted at render rather than printed, so
a premature deploy is safe — but not launch-ready, which
`npm run check:content -- --strict` is what enforces.

---

## Out of scope for Phase 1

Per spec §17, none of the following may delay launch: full CRM · full project
management · full employee dashboard · client portal · NAS integration ·
marketing automation · newsletter campaign engine · prospecting engine ·
QuickBooks API integration · Accountrix Plus integration · AI customer
assistant · full financial dashboard · full project document-management
platform.

`docs/ARCHITECTURE.md` records how each of these attaches to what has been built,
so the later work extends the model rather than replacing it.
