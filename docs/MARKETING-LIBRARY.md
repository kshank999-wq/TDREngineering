# Marketing library

Flyers, brochures, capability statements, rate sheets, project photography —
the material TDR hands to prospects, in one place, with a share link that stays
correct.

---

## The problem this is shaped around

A marketing folder has one predictable failure, and it is not losing a file.
It is somebody confidently sending **last year's rate sheet**.

So an item here is not a file. An item is a **thing** — "Boundary survey
flyer" — that **has versions**, exactly one of which is current. Upload a new
file and it becomes the current one; the old one is kept.

That is what makes the share link durable. **You hand out one link, and when
the flyer is redesigned the same link serves the new one.** Nobody has to be
re-sent anything, and nothing you already put on a business card goes stale.

---

## Using it

**Marketing** in the menu.

1. **Create the item** — title, category, description, tags. The web address
   comes from the title.
2. **Upload the file.** You can note what changed ("Updated 2026 pricing").
3. **Share by link** if it is for prospects. Off by default.

Renaming the item later is fine. **The web address is fixed when you create
it**, so renaming cannot break a link somebody already has.

### Replacing a file

Upload again. It becomes the current version immediately — there is no second
button to press, because "uploaded the new one and got distracted" is exactly
how an item ends up still serving the old file.

Every previous version is kept and downloadable from the item's page. If you
need to go back, **Make current** on an older version.

### Stopping a share

**Stop sharing**, or **Archive** the whole item. Either kills the link
immediately.

That works because the storage bucket is private and the public page mints a
fresh short-lived link each time somebody downloads. **A public bucket URL
could not be taken back** — it gets cached, scraped and forwarded, and
"un-publishing" would be a fiction.

### Shared is not the same as advertised

Shared means "anyone with the link can download it". It does not put anything
on the website or in Google — the pages tell search engines not to index them,
and `/m/` is disallowed in `robots.txt`. Staff routinely share something with
one prospect, and that should not publish it.

---

## Two decisions worth knowing about

### A web address is never reused

The slug is unique across archived items too. Freeing it when something is
archived would mean an old link, already sitting in somebody's inbox, quietly
starts serving a **different document**.

A dead link is a small problem. A link that silently changes what it points at
is not.

### Superseding is not deleting

"What did we send them in March?" is a real question, and the answer has to
survive the redesign. Old versions stay, with who uploaded them and when.

---

## Verified

Against PostgreSQL 16, then end-to-end against production with probe data that
was deleted afterwards:

| Test | Result |
| --- | --- |
| A new version is numbered and becomes current in one step | ✅ |
| **The same link serves the new version after an upload** | ✅ |
| The previous version is kept, not replaced | ✅ |
| An item is unreachable until somebody shares it | 0 rows |
| An item with no file uploaded is unreachable, and flagged in the list | 0 rows |
| Un-sharing kills the link immediately | 0 rows |
| An archived item is unreachable even when still marked shared | 0 rows |
| Blocked downloads do not increment the tally | ✅ |
| An unknown web address | 0 rows |
| Reusing an archived item's web address | refused by unique index |
| A slug with spaces, capitals, leading/trailing/double hyphens | refused by constraint |
| An empty title | refused by constraint |
| Rolling back to a version belonging to a **different item** | refused |
| Rolling back to its own earlier version | ✅ |
| `anon` reading either table or the library view, **with real rows present** | 0 rows each |
| `anon` calling either share function | no privilege |
| `service_role` calling them | ✅ |
| Supabase security advisor | no new findings |

`npm run check:slugs` covers slug generation in CI, including titles nobody
would think to try — emoji, accents, 300 characters, punctuation only. It
checks the generated slug against a **copy of the database's own check
constraint**, so the two rules cannot drift apart. Verified in both
directions: breaking the truncation makes it fail.

## What is not built

- **Nothing has been uploaded through the live site yet.** The database path is
  verified against production; the browser upload is not. Upload one file and
  open its share link before relying on it.
- No image thumbnails or previews. The list shows filenames, not artwork.
- No bulk upload. One file at a time.
- No expiring share links. A link works until somebody stops sharing it.
- No per-recipient tracking. The download count is a total, not a list of who.
- Assets are not attached to proposals or shown in the client portal.
- **No prospect email lists.** That was a separate item on the Phase 2 list and
  is not part of this.
