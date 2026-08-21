# SEO Preservation and Launch Safety

**Spec §14, §21 (Phase 1F).** Preserve search equity by mapping important old
URLs to relevant new pages, and do not let long-standing indexed service pages
simply disappear.

---

## Redirects

The map lives in `src/content/redirects.ts` and is applied by `next.config.ts`
as permanent **301** redirects.

### Filling it in

1. Complete the Phase 1A inventory (`docs/PHASE-1A-ARCHIVE.md`).
2. For every legacy URL with a `newDestination`, add an entry:

   ```ts
   { from: "/services/land-surveying.html", to: "/services/boundary-survey", note: "KEEP — copy reused" },
   ```

3. Prioritize by real traffic, using the analytics and Search Console exports
   taken before access was lost.

### Rules

* Point each old URL at the **closest equivalent page**. Redirecting an old
  service page to the homepage throws away that page's accumulated search
  equity — the exact outcome spec §14 exists to prevent.
* Never chain redirects. `/a → /b → /c` should be flattened to `/a → /c`.
* Anything intentionally left to 404 should be recorded in the inventory's
  `notes` column so it reads as a decision rather than an oversight.

### Verifying

```bash
curl -sI https://www.tdrengineering.com/request-a-quote | head -3
# HTTP/2 301
# location: https://www.tdrengineering.com/request-a-proposal
```

---

## Required web basics — status

Spec §14's list, and where each is handled:

| Requirement | Status | Where |
| --- | --- | --- |
| XML sitemap | ✅ Implemented | `src/app/sitemap.ts` — all static pages plus every service page |
| robots.txt | ✅ Implemented | `src/app/robots.ts` — allows the site, disallows `/admin` and `/api` |
| Canonical URLs | ✅ Implemented | `alternates.canonical` on every page's metadata |
| OpenGraph / social metadata | ✅ Implemented | `src/app/layout.tsx` plus per-page overrides |
| Page titles and descriptions | ✅ Implemented | Per-route `metadata` exports |
| Google Search Console | ⚙️ Needs TDR | Verify the property; set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` |
| Web analytics | ⚙️ Needs TDR | Set `NEXT_PUBLIC_GA_MEASUREMENT_ID`, or enable Vercel Analytics |
| Responsive mobile design | ✅ Implemented | Mobile-first throughout; verify on real devices |
| Optimized images and video | ⚙️ Needs assets | See the hero note below |
| Lazy loading and caching | ✅ Implemented | Next static generation + Vercel CDN; hero video is `preload="metadata"` |
| HTTPS everywhere | ✅ Implemented | Vercel SSL + HSTS header in `next.config.ts` |

Structured data is also in place: `ProfessionalService` on every page, `Service`
on each service page, and `FAQPage` on `/questions`.

### The hero video

`src/content/site.ts` → `heroMedia`. Until TDR supplies footage the hero renders
a lightweight animated SVG, so nothing is broken and nothing is slow. When the
video arrives:

* H.264 MP4 plus a VP9 or AV1 WebM, **no audio track**, 1920×1080, under ~4 MB
  for a 10–20 second loop.
* Poster exported from the first frame, WebP or JPEG, under ~200 KB.
* Put both in `/public/media` and set the paths in `heroMedia`.
* Re-run Lighthouse afterwards — spec §4 requires the video not materially slow
  page load.

---

## Launch sequence (Phase 1F)

Work top to bottom. Do not start until Phase 1A is complete and archived.

### Pre-launch

| # | Step | Done |
| --- | --- | --- |
| 1 | Legacy site archived and stored in TDR-controlled storage | ☐ |
| 2 | Inventory dispositions complete; redirect map filled in | ☐ |
| 3 | `npm run check:content -- --strict` passes (see `docs/CONTENT-REQUIRED.md`) | ☐ |
| 4 | All marketing claims reviewed and approved by TDR (spec §4) | ☐ |
| 5 | Supabase migrations applied to the production project | ☐ |
| 6 | Two TDR owner-role admin accounts created and tested | ☐ |
| 7 | Production environment variables set in Vercel | ☐ |
| 8 | Turnstile keys configured and the widget rendering | ☐ |
| 9 | Analytics and Search Console properties created | ☐ |
| 10 | DNS zone exported; A/CNAME TTL lowered 24–48h in advance | ☐ |

### QA

| # | Step | Done |
| --- | --- | --- |
| 11 | Desktop QA — Chrome, Safari, Firefox, Edge | ☐ |
| 12 | Mobile QA — real iOS and Android devices, not just an emulator | ☐ |
| 13 | Tablet QA | ☐ |
| 14 | Keyboard-only navigation of every page and form | ☐ |
| 15 | Proposal form: every service, every conditional question | ☐ |
| 16 | Proposal form: file upload, oversize rejection, bad file type rejection | ☐ |
| 17 | Proposal form: professional referral captures the referring person | ☐ |
| 18 | Verify the test submission landed correctly in Supabase | ☐ |
| 19 | Prospect confirmation email arrives in inbox, not spam | ☐ |
| 20 | TDR notification email arrives and its admin link works | ☐ |
| 21 | Contact form end to end | ☐ |
| 22 | Internal view: search, status filter, status change, notes, CSV export | ☐ |
| 23 | Attachment download from the internal view works | ☐ |
| 24 | Lighthouse ≥ 90 for Performance, Accessibility, Best Practices, SEO | ☐ |
| 25 | Email migration complete and verified (`docs/EMAIL-MIGRATION.md`) | ☐ |
| 26 | Backups configured and a restore tested (`docs/BACKUP-AND-RECOVERY.md`) | ☐ |

### Cutover

| # | Step | Done |
| --- | --- | --- |
| 27 | Publish the Vercel DNS records — **do not touch MX** | ☐ |
| 28 | Confirm SSL is issued and both hosts serve | ☐ |
| 29 | Spot-check the top 20 legacy URLs return 301 to the right pages | ☐ |
| 30 | Submit the sitemap in Search Console | ☐ |
| 31 | Confirm analytics is recording live traffic | ☐ |
| 32 | Submit a real proposal request through the production site | ☐ |
| 33 | Raise DNS TTL back to normal | ☐ |
| 34 | Old hosting still active and **not** cancelled | ☐ |

### First two weeks

| # | Step | Done |
| --- | --- | --- |
| 35 | Watch Search Console coverage for unexpected 404s; add missed redirects | ☐ |
| 36 | Watch analytics for pages that lost traffic — usually a missed redirect | ☐ |
| 37 | Confirm proposal requests are arriving and being actioned | ☐ |
| 38 | Review spam volume; tighten Turnstile or rate limits if needed | ☐ |
| 39 | Move DMARC from `p=none` toward enforcement once reports are clean | ☐ |
| 40 | Only then consider decommissioning the old hosting | ☐ |
