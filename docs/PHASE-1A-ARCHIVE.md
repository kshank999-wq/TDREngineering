# Phase 1A — Archiving the Existing Website

**Spec §3.** Before changing DNS or replacing the current site, create a
complete independent archive and inventory of the existing TDREngineering.com
website.

The order matters. Once DNS moves, the old site may become unreachable with no
warning and no way to get it back — including from the previous developer.
Archive first, always.

---

## 1. Run the crawler

```bash
LEGACY_SITE_URL=https://www.tdrengineering.com npm run archive:crawl
```

Optional tuning:

```bash
ARCHIVE_MAX_PAGES=1000 \
ARCHIVE_DELAY_MS=600 \
ARCHIVE_OUTPUT_DIR=./archive \
npm run archive:crawl
```

The crawler seeds itself from `/sitemap.xml`, `/sitemap_index.xml` and
`/wp-sitemap.xml` when they exist, then follows internal links. It is polite by
default (400 ms between requests) and identifies itself in the User-Agent.

### What it writes

```
archive/
  pages/<slug>.html   Raw HTML of every discovered page
  assets/<path>       Images, videos, PDFs and downloads, at their original paths
  robots.txt          The legacy robots.txt, if present
  inventory.csv       One row per page — the migration table (spec §3)
  assets.csv          One row per downloaded asset
  links.csv           Every internal link, for redirect mapping
  crawl-log.txt       Errors, skipped URLs, and the run summary
```

`archive/` is gitignored: it is large, and it belongs in TDR-controlled storage
rather than in the application repository.

---

## 2. Capture what a crawler cannot

The crawler gets everything served over HTTP. These need a person:

* **Form field logic** — the existing request-a-quote form's fields,
  validation, conditional behaviour and where its submissions are delivered.
  Screenshot the rendered form and record the destination email address.
* **CMS-only content** — drafts, unpublished pages, and anything behind a login.
* **Analytics history** — export the last 24 months from the existing analytics
  property before access is lost. Which pages actually get traffic decides
  which redirects matter.
* **Search Console data** — export the top queries and top pages. Same reason.
* **DNS zone** — export or screenshot every current DNS record before touching
  anything. This is the single most important item on this list.
* **Email inventory** — see `docs/EMAIL-MIGRATION.md`.
* **Third-party embeds** — maps, chat widgets, review widgets, tracking pixels.
* **Original asset files** — logo vector files, photography originals, video
  masters. The web-optimized copies the crawler captures are not sources.

---

## 3. Complete the inventory

`inventory.csv` ships with these columns:

| Column | Filled by | Notes |
| --- | --- | --- |
| `url` | crawler | Legacy URL |
| `status` | crawler | HTTP status |
| `title` | crawler | SEO page title |
| `metaDescription` | crawler | SEO meta description |
| `h1` | crawler | Primary heading |
| `wordCount` | crawler | Rough content volume |
| `assetCount` | crawler | Images/downloads on the page |
| `category` | crawler | Best-guess page type |
| `localFile` | crawler | Path to the archived HTML |
| `disposition` | **you** | KEEP / REFRESH / REBUILD / ARCHIVE |
| `newDestination` | **you** | Path on the new site |
| `notes` | **you** | Anything the next person needs to know |

### Disposition definitions (spec §3)

| Value | Meaning |
| --- | --- |
| **KEEP** | Accurate and reusable with minor cleanup |
| **REFRESH** | Valuable content that needs modern wording |
| **REBUILD** | Important topic that should become a substantially better page |
| **ARCHIVE** | Preserve internally but do not necessarily republish |

Work highest-traffic pages first — that is what the analytics export is for.

---

## 4. Turn the inventory into redirects

Every row with a `newDestination` becomes an entry in
`src/content/redirects.ts`:

```ts
{ from: "/services/land-surveying.html", to: "/services/boundary-survey", note: "KEEP — copy reused" },
```

Rules:

* Point each old URL at the **closest equivalent page**, never at the homepage
  when a relevant page exists. A homepage redirect discards the accumulated
  search equity for that page.
* Rows marked ARCHIVE with no new destination will 404. That is a decision —
  record it in `notes`.
* After launch, watch Search Console's coverage report and analytics 404s for a
  few weeks. Anything that shows up is a redirect you missed; add it.

---

## 5. Store the archive where TDR controls it

The archive is only useful if it survives. Put a copy in **at least two** of:

* TDR-controlled cloud storage (Google Drive, OneDrive, S3)
* TDR's NAS or file server
* An external drive held at the office

Spec §15 requires an *independent legacy-site archive* and an *independent copy
of important site assets* — two separate obligations. The `archive/` folder
satisfies both only once it is stored somewhere other than a developer's laptop
and this repository.

---

## 6. Do not decommission the old site yet

Keep the old hosting active until:

* The new site is live and verified.
* Redirects are confirmed working against the real production domain.
* Email migration is complete and verified (`docs/EMAIL-MIGRATION.md`).
* The archive has been spot-checked — open a handful of archived pages and
  confirm the HTML and images actually render offline.

Only then cancel the old hosting.
