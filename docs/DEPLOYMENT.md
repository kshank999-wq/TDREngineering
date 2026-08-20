# Deployment — Supabase, Vercel, DNS

**Spec §2, §21 (Phase 1B).** Establish TDR-controlled infrastructure with
development, preview and production environments.

Complete `docs/OWNERSHIP-AND-ACCOUNTS.md` alongside this — an environment that
works but that TDR cannot administer has not met Phase 1.

---

## 1. Supabase

1. Create the project **under a TDR-owned Supabase organization**. Choose a
   region close to TDR's clients.
2. Save the database password in TDR's password manager immediately — Supabase
   shows it once.
3. Apply the migrations:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

   Or paste `supabase/migrations/0001_init.sql` then `0002_storage.sql` into the
   SQL editor and run them in that order. Both are idempotent.
4. Confirm the `proposal-uploads` bucket exists and is **private**.
5. Create the first admin users — see `supabase/README.md`. Create **two**
   owner-role accounts.
6. From Settings → API, copy the project URL, the `anon` key and the
   `service_role` key.

The service role key bypasses Row Level Security. It belongs only in Vercel's
server-side environment variables and in the password manager. It must never
appear in client code, in a `NEXT_PUBLIC_*` variable, or in a commit.

---

## 2. Transactional email provider

Needed for prospect confirmations and TDR proposal notifications.

1. Create a Resend account (or equivalent) owned by TDR.
2. Verify a **subdomain** — `mail.tdrengineering.com` — not the root domain.
   This keeps website mail reputation separate from the mailboxes staff depend
   on (spec §13).
3. Add the DKIM and SPF records the provider gives you for that subdomain.
4. Copy the API key.

Until this is configured, set `EMAIL_PROVIDER=console`: submissions still save
to Supabase and the message body is logged. Nothing is lost, but nobody is
notified — so do not launch that way.

---

## 3. Vercel

1. Create the project under a **TDR-owned Vercel team** and connect this
   GitHub repository.
2. Framework preset: Next.js. Build command and output directory are detected.
3. Add the environment variables below.
4. Deploy.

### Environment variables

Set for **Production**, **Preview** and **Development** unless noted.

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://www.tdrengineering.com` | Use the preview URL for Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Safe in the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Safe in the browser — RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | **Server only. Never `NEXT_PUBLIC_`** |
| `SUPABASE_PROPOSAL_BUCKET` | `proposal-uploads` | |
| `EMAIL_PROVIDER` | `resend` | `console` only for local development |
| `RESEND_API_KEY` | Provider API key | Server only |
| `EMAIL_FROM` | `TDR Engineering <no-reply@mail.tdrengineering.com>` | Must be a verified sending identity |
| `EMAIL_REPLY_TO` | `info@tdrengineering.com` | Where replies actually go |
| `PROPOSAL_NOTIFICATION_TO` | `proposals@tdrengineering.com` | Comma-separated for multiple recipients |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key | Enable before launch |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret | Server only |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Optional |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Search Console token | Optional |

### Environments

| Environment | Branch | Supabase project |
| --- | --- | --- |
| Production | `main` | Production Supabase project |
| Preview | every PR | **A separate Supabase project**, not production |
| Development | local | The preview/development Supabase project |

Point previews at a non-production database. Otherwise a test submission from a
preview deployment lands in TDR's real proposal queue.

---

## 4. DNS and the production cutover

Do not do this until `docs/PHASE-1A-ARCHIVE.md` is complete and the archive is
stored somewhere TDR controls.

### Before the cutover

1. **Export the entire current DNS zone.** Every record. This is the rollback
   path and it takes two minutes.
2. **Lower the TTL** on the `A`/`CNAME` records for `tdrengineering.com` and
   `www` to 300 seconds, at least 24–48 hours in advance.
3. **Leave MX and mail-related records completely alone.** Website DNS and
   email DNS are separate concerns (spec §12) and changing them together turns
   one problem into two.
4. Add both `tdrengineering.com` and `www.tdrengineering.com` as domains in the
   Vercel project and let it tell you the exact records to publish.
5. Decide which host is canonical — `www` is the safer default — and configure
   the other to redirect to it in Vercel.

### The cutover

1. Publish the Vercel records. Do not remove MX or any TXT record.
2. Watch propagation; with a 300-second TTL this is minutes.
3. Vercel issues the SSL certificate automatically once DNS resolves.
4. Work through the launch checklist in `docs/SEO-AND-LAUNCH.md`.
5. Raise the TTL back to a normal value once stable.

### Rollback

Restore the exported A/CNAME records. With a low TTL this is a few minutes.
This only works if the export was taken — do not skip it.

---

## 5. Post-deploy verification

| Check | How |
| --- | --- |
| Site serves over HTTPS | Visit both apex and `www` |
| Canonical host redirects | The non-canonical host 301s to the canonical one |
| Legacy redirects fire | `curl -I https://www.tdrengineering.com/request-a-quote` → 301 |
| Proposal form saves | Submit a test request; confirm the row in `opportunities` |
| Attachments upload | Attach a PDF; confirm the row in `files` and the object in the bucket |
| Prospect confirmation arrives | Check the inbox, and the spam folder |
| TDR notification arrives | Check `PROPOSAL_NOTIFICATION_TO` |
| Internal view works | Sign in at `/admin/login`, open the test request, change status, add a note |
| Admin is not indexable | `curl https://www.tdrengineering.com/robots.txt` disallows `/admin` |
| Sitemap resolves | `/sitemap.xml` returns the full page list |

Delete the test opportunity afterwards, or set its status to `cancelled` so it
does not sit in the real queue.
