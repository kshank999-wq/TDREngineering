# Architecture and the Path to Later Phases

**Spec §11, §18, §19, §20.** Phase 1 ships a website and a proposal system, but
the data model underneath it is the first interface to a future TDR operating
platform — not a disconnected marketing site.

---

## The relationship model

Spec §8's rule, stated as a design constraint: **do not assume
Client = Project = Referral Source.** These are separate objects.

The worked example from the spec — *Smith Architecture refers homeowner Jane Doe
for a survey at 123 Main Street* — produces:

```
companies:     Smith Architecture (type: architecture)
contacts:      Alan Smith        → company_id = Smith Architecture, is_professional = true
contacts:      Jane Doe          → the client, a separate person
properties:    123 Main Street   → the physical location, independent of both
opportunities: TDR-2026-01000    → contact = Jane, property = 123 Main Street
referrals:     source = architect, referring_contact = Alan, referring_company = Smith Architecture
```

Five distinct records, correctly related. This is what lets TDR later ask "how
much work has Smith Architecture sent us?" — a question that is unanswerable if
the referral was only ever a text field on a form.

Spec §18's target chain is preserved end to end:

```
Person ↔ Company ↔ Referral Relationship ↔ Property ↔ Opportunity
       ↔ Proposal ↔ Project ↔ Files ↔ Accounting ↔ Marketing
```

Phase 1 implements everything through Opportunity and Files. `opportunities`
already carries a nullable `project_number` column so the Project link can be
added without a migration that touches existing rows.

---

## Tables

| Table | Holds |
| --- | --- |
| `contacts` | People — clients and referring professionals alike, distinguished by `is_professional` |
| `companies` | Architecture firms, engineering firms, contractors, developers, corporate clients |
| `properties` | Physical project locations, indexed for address and APN search |
| `opportunities` | Proposal requests / potential projects — the source of truth for an inbound request |
| `referrals` | The relationship between a referral source and an opportunity |
| `services` | The TDR service catalog, mirroring `src/content/services.ts` |
| `opportunity_services` | Which services each opportunity requested, with per-service answers |
| `files` | Metadata for submitted documents; bytes live in Storage |
| `website_inquiries` | General contact-page inquiries |
| `app_users` | Internal and future client users, with the full Phase 1+ role enum |
| `opportunity_notes` | Internal notes |
| `opportunity_status_history` | Audit trail of every status change, written by trigger |

### Conventions

* **UUID primary keys** — stable, non-guessable, safe in URLs.
* **`created_at` / `updated_at`** on everything, `updated_at` maintained by
  trigger rather than by application code.
* **Soft delete** via `archived_at`. Nothing hard-deletes; every unique index
  and query is scoped `where archived_at is null`.
* **De-duplication on intake.** Companies match on normalized name, contacts on
  email (case-insensitive via `citext`), properties on APN then address. A
  returning client enriches their existing record rather than creating a
  duplicate — and rather than overwriting known-good data with blanks.
* **Raw values preserved.** `referrals` keeps `raw_name` / `raw_company` /
  `raw_email` / `raw_phone` exactly as typed, even after matching, so a wrong
  match can always be audited and corrected.

---

## Search foundation

Spec §11 requires the future internal system to search by client name, company,
email, phone, project address, APN, referring professional, referral company,
proposal number and project number.

`v_opportunity_search` joins all of it into one row per opportunity with a
`search_text` column covering every one of those fields. The internal proposal
view queries it directly. It is declared `security_invoker`, so it inherits the
Row Level Security of its base tables rather than bypassing them.

Base-table GIN trigram indexes back the individual columns. If the view's
`ilike` scan becomes slow at volume, the migration path is a materialized
`search_text` column on `opportunities` with its own GIN index — the view's
shape stays the same, so nothing calling it has to change.

---

## Security model

**Spec §15.** Layered, with the database as the backstop.

| Layer | Mechanism |
| --- | --- |
| Transport | HTTPS everywhere; HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` set in `next.config.ts` |
| Input | Zod schemas in `src/lib/validation.ts`, revalidated server-side regardless of what the browser did |
| Files | Extension **and** MIME must both match; per-file and per-submission size caps; filenames sanitized; private bucket |
| Bots | Honeypot, timing check, and Cloudflare Turnstile when configured |
| Abuse | Per-IP rate limiting on both intake routes |
| Authentication | Supabase Auth; `middleware.ts` gates `/admin`, `getStaffUser()` checks the role |
| Authorization | Row Level Security on every table, deny by default |
| Secrets | Environment variables only; `server-only` import guards the service-role client |
| Privacy | Submitter IPs are stored as a salted hash, never in the clear |

The service-role key bypasses RLS and is used only by the intake routes, which
must create records on behalf of an anonymous visitor. Everything the admin area
does goes through the RLS-scoped session client, so the database enforces
staff-only access independently of the application code.

### Roles

`app_role` implements spec §16's full list now, even though Phase 1 only
exercises the first three:

`owner` · `manager` · `proposal_staff` · `project_manager` · `field_staff` ·
`accounting` · `marketing` · `client`

`is_staff()` (any role but `client`), `is_admin()` (owner or manager) and
`current_app_role()` are `SECURITY DEFINER` helpers that policies call, so
authorization logic lives in one place.

---

## Proposal intake flow

Spec §9's workflow, as implemented in `src/app/api/proposals/route.ts` and
`src/lib/intake.ts`:

```
1. Validate form and file inputs        → validation.ts, uploads.ts
2. Apply spam/bot protection            → spam.ts (honeypot, timing, Turnstile)
3. Create or associate contact          → intake.ts findOrCreateContact
4. Create or associate company          → intake.ts findOrCreateCompany
5. Create/associate property            → intake.ts findOrCreateProperty
6. Associate referral source            → intake.ts createReferral
7. Create opportunity record            → intake.ts createProposalRecord
8. Store attachment metadata            → storeUploads + recordFileMetadata
9. Send confirmation to prospect        → email/templates.ts
10. Send notification to TDR            → email/templates.ts
```

Steps 3–8 complete **before** steps 9–10 are attempted, and an email failure is
logged loudly but never fails the request. Spec §9: *the database record is the
source of truth — a proposal request must not disappear merely because an email
notification is missed.*

---

## Notes for later phases

These are deliberately **not** built (spec §17), but the architecture already
accommodates them.

### File storage (spec §19)

`files` stores `storage_provider`, `storage_bucket` and `storage_path` as plain
columns rather than assuming Supabase. When project files move to a
TDR-controlled NAS or cloud object store, add a provider value and a resolver —
the relational metadata and permissions stay where they are, and large
engineering datasets never go into the database itself.

### Accounting (spec §20)

QuickBooks is the current destination, not a permanent one. Integration should
go behind an abstraction in `src/lib/accounting/` that publishes business
*events* — `proposal.accepted`, `project.created`, `invoice.requested` — rather
than calling QuickBooks from route handlers. Routing the same events to
Accountrix Plus later then costs a new adapter, not a rebuild of the public
website.

### Client portal (spec §17)

The `client` role and the `app_users` table already exist. When the portal is
built, add RLS policies scoping a client to their own contact/company and the
opportunities linked to it. No schema change is required to start.

### AI knowledge assistant (spec §6)

`src/content/faqs.ts` is already structured — id, question, category, keywords,
answer paragraphs, related ids — rather than stored as prose. It can be consumed
as an approved-knowledge corpus without re-parsing marketing copy.

### CRM (spec §17)

`opportunity_status_history`, `opportunity_notes` and the full role enum are the
seams a CRM grows from. The Phase 1 internal view intentionally does the minimum
spec §10 asks for: *prevent new business data from becoming inaccessible while
the larger internal system is developed.*
