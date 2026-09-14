# Supabase — TDR Engineering Phase 1

## Applying migrations

Migrations are plain SQL and run in filename order.

**Supabase CLI (preferred):**

```bash
supabase link --project-ref <project-ref>
supabase db push
```

**SQL editor (fallback):** paste each file's *contents* — not its path — into
the project SQL editor and run them in filename order: `0001_init.sql`,
`0002_storage.sql`, `0003_shipping.sql`, `0004_merge.sql`, `0005_harden.sql`,
`0006_jobs.sql`, `0007_job_files.sql`, `0008_billing.sql`, `0009_portal.sql`,
`0010_proposals.sql`. All are idempotent and safe to re-run.

## What the schema gives you

| Table | Purpose |
| --- | --- |
| `contacts` | People — clients and referring professionals alike |
| `companies` | Architecture firms, engineering firms, contractors, developers, corporate clients |
| `properties` | Physical project locations, keyed for APN and address search |
| `opportunities` | Proposal requests / potential projects — the source of truth for an inbound request |
| `referrals` | The relationship between a referral source and an opportunity |
| `services` / `opportunity_services` | Service catalog and the services requested on each opportunity |
| `files` | Metadata for documents — proposal attachments and job files. Bytes live in Storage; `storage_provider` is per row so they can move (`0001`, `0007`) |
| `website_inquiries` | General contact-page inquiries |
| `app_users` | Internal and future client users, with the Phase 1+ role enum |
| `opportunity_notes`, `opportunity_status_history` | Internal notes and an audit trail of status changes |
| `shipments` | Every shipping label bought, with the address it was printed with frozen at purchase (`0003`) |
| `jobs` | Accepted work: number, status, dates, contract amount. Everything after a proposal attaches here (`0006`) |
| `job_notes`, `job_status_history` | Internal notes and an audit trail of job status changes (`0006`) |
| `invoices`, `invoice_lines`, `payments` | Billing. Totals derive from the lines by trigger; "paid" derives from the payments (`0008`) |
| `client_portal_access` | Which client login may see which contact's jobs, and whether that extends to the whole firm (`0009`) |
| `proposals`, `proposal_lines` | What TDR offered — scope, exclusions, fee, terms. Frozen by trigger once sent (`0010`) |
| `proposal_access_tokens` | Signing links. Only the SHA-256 of each token is stored; the raw token lives in the link and nowhere else (`0010`) |
| `proposal_signatures`, `proposal_events` | The signature and its audit trail. Read-only to everyone signed in, owners included (`0010`) |

Duplicate client records are merged by `merge_contacts()` / `merge_companies()`
(`0004`) — one atomic function each, staff-gated in the database. The losing
record is archived with `merged_into_id` set, never deleted. See
`docs/MERGING-CLIENTS.md`.

`v_client_directory` unions contacts and companies into one searchable list so
the admin can find a person or a firm in a single query (`0003`), and
`v_duplicate_clients` pairs up records that share an email, phone or name
(`0004`).

`v_opportunity_search` joins all of it into one row per opportunity with a
`search_text` column covering client name, company, email, phone, project
address, APN, referring professional, referral company, proposal number and
project number (spec §11).

## Row Level Security

RLS is enabled on every table and denies by default.

### Function privileges

Supabase grants `EXECUTE` on every new function in `public` to `anon` by
default, which puts it on the REST API at `/rest/v1/rpc/<name>`. For a
`SECURITY DEFINER` function — one that bypasses RLS on purpose — that is a
public endpoint with elevated rights, so each one is locked down explicitly
(`0004`, `0005`):

* `is_staff()`, `is_admin()`, `current_app_role()`, `client_impact()`,
  `merge_contacts()`, `merge_companies()`, `client_can_see_job()`,
  `current_client_contact()` — revoked from `public` and `anon`, granted to
  `authenticated` only.
* `proposal_for_signing()`, `proposal_document_for_signing()`,
  `record_proposal_view()`, `accept_proposal()`, `decline_proposal()` —
  revoked from everybody and granted back to **`service_role` alone** (`0010`).
  The public signing page is anonymous, so a server route holding the service
  role calls these after hashing the token itself; not even signed-in staff may
  call them. **The re-grant is not optional**: revoking from `public` takes the
  privilege away from `service_role` too, because it inherits like every other
  role, and `BYPASSRLS` skips row policies rather than `EXECUTE`.
* `log_opportunity_status_change()` and `recalculate_proposal_totals()` are
  trigger functions and need no grant at all; PostgreSQL checks `EXECUTE` when
  a trigger is created, not when it fires. Both are revoked anyway so they stay
  off the REST API — verified as the `authenticated` role, with the privilege
  revoked, that the trigger still fires.
* Revoke from **`public` first**. Every role inherits it, so revoking from
  `anon` alone changes nothing.
* `authenticated` must keep `EXECUTE` on `is_staff()` — the staff policies
  call it while the query runs, and the privilege is checked against the
  calling role. Revoking it without re-granting takes the whole admin down.
* Adding a `SECURITY DEFINER` function means doing both halves: the grants
  *and* an `is_staff()` check inside the function, so neither alone is
  load-bearing.

Run `get_advisors` (or the Supabase dashboard's Security Advisor) after any
migration that adds a function — it catches exactly this.

* `anon` can read only `services` and `referral_sources`.
* `authenticated` staff (an `app_users` row with `is_active` and a role other
  than `client`) can read business data and change opportunity status.
* Everything the public website writes goes through `/api/proposals` and
  `/api/inquiries`, which use the **service role key** server-side. That key
  must never be exposed to the browser.

### Client logins read no table at all

A client (`app_users.role = 'client'`) has **no policy on `jobs`, `files`,
`invoices` or `payments`**. RLS filters rows, not columns, so a policy letting
a client read their own job row would also hand them `jobs.notes`. Instead they
read four `SECURITY DEFINER` views — `v_portal_jobs`, `v_portal_files`,
`v_portal_invoices`, `v_portal_payments` — which select only client-safe
columns and every one of which filters through the single predicate
`client_can_see_job()` (`0009`). Those views bypass RLS, so they are revoked
from `anon`: an anonymous grant there would be a public read of every job.
See `docs/CLIENT-PORTAL.md`.

## Verifying the migration landed

Run this after `0001`, `0002` and `0003`. It should report 14 tables, 27
services, 10 referral sources, and RLS enabled everywhere.

```sql
select
  (select count(*) from pg_tables
     where schemaname = 'public'
       and tablename in ('app_users','companies','contacts','properties','services',
                         'referral_sources','opportunities','opportunity_services',
                         'referrals','files','website_inquiries','opportunity_notes',
                         'opportunity_status_history','shipments'))  as tables_created,
  (select count(*) from services)                                  as services_seeded,
  (select count(*) from referral_sources)                          as referral_sources_seeded,
  (select count(*) from pg_tables
     where schemaname = 'public' and not rowsecurity)              as tables_without_rls,
  (select count(*) from storage.buckets where id = 'proposal-uploads'
     and public = false)                                           as private_bucket;
```

Expected: `14 | 27 | 10 | 0 | 1`.

`tables_without_rls` must be **0**. Anything else means a table is publicly
readable and the migration should be re-run before going further.

## Creating the first admin users

1. Supabase dashboard → Authentication → Users → **Add user**. Use a
   TDR-controlled address and a strong password. Do this **twice** — spec §2
   requires at least two TDR-controlled owner accounts so no single person can
   be locked out of the database.
2. Run in the SQL editor, with the addresses you just created. This looks the
   accounts up by email rather than asking you to copy UUIDs by hand, and is
   safe to re-run:

```sql
insert into app_users (id, email, full_name, role)
select u.id, u.email, v.full_name, 'owner'
  from auth.users u
  join (values
          ('owner@tdrengineering.com',  'TDR Owner'),
          ('backup@tdrengineering.com', 'TDR Second Owner')
       ) as v(email, full_name) on lower(u.email) = lower(v.email)
on conflict (id) do update
  set role = 'owner', is_active = true, archived_at = null,
      full_name = excluded.full_name;

-- Confirm both landed. Two rows, both role=owner, both is_active.
select email, role, is_active from app_users order by email;
```

If a row is missing, the auth user for that address does not exist yet — go
back to step 1 rather than editing this query.

## Backups

Supabase takes automated backups on paid plans. Spec §15 also requires
*periodic independent data exports* — see `docs/BACKUP-AND-RECOVERY.md`.
