# Content TDR Needs to Supply

Everything on this page is a **fact about the business that only TDR can
confirm**. None of it can be inferred from the codebase, and none of it should
be guessed — a plausible-looking wrong value (a made-up phone number, an
approximated address) survives review in a way a blank never does, and reaches
customers.

Run `npm run check:content` at any time to see what is still outstanding.

---

## How unknowns behave right now

The site is built so that an unverified fact is **omitted**, not rendered.
Today that means:

* No phone number appears in the header, footer, homepage, about page or
  proposal sidebar.
* The contact page shows email only — no office block, no hours.
* No `telephone` or `address` is published into structured data, so search
  engines and map providers are not fed a value that would later need
  retracting.
* The hero renders an animated reality-capture graphic instead of video.

The site is therefore safe to deploy in this state — it simply says less. It is
**not** ready to launch, which is what `npm run check:content -- --strict`
enforces.

---

## 1. Contact details — blocking

Paste these back filled in and they go straight into `src/content/site.ts`.

```
Phone (as displayed):        e.g. (626) 555-0142
Phone (dial form):           e.g. +16265550142
Public email:                currently assumed to be info@tdrengineering.com
Street address:
Suite / unit (if any):
City:
State (2-letter):
ZIP:
Business hours (as displayed):  e.g. Monday – Friday, 8:00 AM – 5:00 PM
```

Notes:

* The two phone forms must match. The dial form is what a phone actually calls.
* If TDR has more than one office, say so — the footer and contact page
  currently assume one, and that is a layout change rather than a value change.
* If the public email is not `info@`, it must change in **two** places: this
  file's value and `EMAIL_REPLY_TO` in the Vercel environment.

## 2. Brand assets — blocking for the logo, otherwise cosmetic

| Asset | Format | Used by |
| --- | --- | --- |
| Logo | SVG preferred, or PNG at 3× the display size | Header, footer |
| Logo mark (square) | SVG or PNG | Favicon, social cards |
| Brand colors | Hex values, or the logo source to sample from | `--color-brand-*` in `src/app/globals.css` |

Until the logo arrives the header renders a "TDR" wordmark tile. It looks
deliberate rather than broken, so this does not block a soft launch — but the
site should not stay that way.

The current palette is a deep engineering navy with a precision-instrument cyan
accent, chosen to read as technical rather than generic. If TDR has official
brand colors, they replace it.

## 3. Hero video — blocking

Spec §4 asks for a 10–20 second silent promotional sequence with a static
fallback image.

**Content to include:** LiDAR scanner in operation · point clouds forming into
buildings or sites · survey crews and field technology · CAD, survey plans,
BIM/Revit models · architectural survey deliverables · 3D scanning scenes ·
civil engineering plans and finished work.

**Encoding:**

* H.264 MP4 **and** a VP9 or AV1 WebM
* **No audio track** — the hero is silent by design
* 1920×1080, under ~4 MB for the full loop
* Poster exported from the first frame, WebP or JPEG, under ~200 KB

Drop the files in `public/media` and set the paths in `heroMedia`
(`src/content/site.ts`). Re-run Lighthouse afterwards — the spec requires the
video not materially slow page load.

## 4. "Does Your Survey Look Like This?" imagery — blocking

The comparison currently uses two schematic panels that illustrate the argument
honestly (sparse measured points versus a dense point cloud) but are not real
deliverables.

Supply **two images of the same or a comparable site**:

1. A conventional survey sheet
2. A TDR scan-derived sheet

Both must be cleared for public use — redact client names, addresses and any
identifying detail that has not been approved. Set `conventionalImage` and
`tdrImage` in `src/components/survey-comparison.tsx` and the schematic panels
drop out automatically.

This is the single highest-impact asset on the site. It is the spec's primary
marketing concept, and real deliverables will make the argument far better than
any illustration can.

## 5. Project examples — blocking

`src/content/projects.ts` holds three structural placeholders describing the
*kind* of work TDR does. Each needs replacing with a real project:

```
Title:
What the project was:
Services TDR performed:
Client name (or "do not disclose"):
Location (or "do not disclose"):
Images cleared for public use:  yes / no
```

Anything not cleared should simply be omitted — an empty list renders a clean
"migration in progress" state rather than a broken grid.

## 6. About page — blocking

The About page currently carries capability copy that is true of the services
built into the site, but no company specifics. It needs:

* Company history — founded when, by whom, how it grew
* **Licensure** — PLS / PE license numbers and the states TDR is licensed in.
  Get this exactly right; an incorrect licensure claim is a professional and
  legal problem for a surveying and engineering firm, not a typo.
* Key staff, if TDR wants them public
* Service area — the counties or regions TDR actually covers
* Any professional affiliations or certifications

## 7. Legacy redirect map — blocking, and time-sensitive

This one depends on the Phase 1A archive, and the window closes when DNS moves.

1. `LEGACY_SITE_URL=https://www.tdrengineering.com npm run archive:crawl`
2. Complete the `disposition` and `newDestination` columns in
   `archive/inventory.csv`
3. Copy the pairs into `src/content/redirects.ts`

See `docs/PHASE-1A-ARCHIVE.md`. Only the 14 seeded conventional aliases are
present today, which will not preserve the search equity of the real indexed
pages.

---

## Marketing copy approval — spec §4

Separately from the gaps above: **all public marketing claims must be approved
by TDR before publication.** The service descriptions, FAQ answers and homepage
copy were drafted to be accurate to the services described in the spec, but
they have not been reviewed by anyone at TDR.

Pay particular attention to anything comparative or quantitative:

* "pricing that competes with conventional survey services"
* "fast turnaround"
* "3D scanning included in applicable survey workflows"
* the "1.4 million measured points" figure on the comparison graphic

Each is defensible as written, but each is a claim TDR is making publicly, and
TDR should decide whether it wants to make it.
