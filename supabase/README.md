# Supabase — TDR Engineering Phase 1

## Applying migrations

Migrations are plain SQL and run in filename order.

**Supabase CLI (preferred):**

```bash
supabase link --project-ref <project-ref>
supabase db push
```

**SQL editor (fallback):** paste `migrations/0001_init.sql` then
`migrations/0002_storage.sql` into the project SQL editor and run them in that
order. Both are idempotent and safe to re-run.

## What the schema gives you

| Table | Purpose |
| --- | --- |
| `contacts` | People — clients and referring professionals alike |
| `companies` | Architecture firms, engineering firms, contractors, developers, corporate clients |
| `properties` | Physical project locations, keyed for APN and address search |
| `opportunities` | Proposal requests / potential projects — the source of truth for an inbound request |
| `referrals` | The relationship between a referral source and an opportunity |
| `services` / `opportunity_services` | Service catalog and the services requested on each opportunity |
| `files` | Metadata for submitted documents (bytes live in Storage) |
| `website_inquiries` | General contact-page inquiries |
| `app_users` | Internal and future client users, with the Phase 1+ role enum |
| `opportunity_notes`, `opportunity_status_history` | Internal notes and an audit trail of status changes |

`v_opportunity_search` joins all of it into one row per opportunity with a
`search_text` column covering client name, company, email, phone, project
address, APN, referring professional, referral company, proposal number and
project number (spec §11).

## Row Level Security

RLS is enabled on every table and denies by default.

* `anon` can read only `services` and `referral_sources`.
* `authenticated` staff (an `app_users` row with `is_active` and a role other
  than `client`) can read business data and change opportunity status.
* Everything the public website writes goes through `/api/proposals` and
  `/api/inquiries`, which use the **service role key** server-side. That key
  must never be exposed to the browser.

## Verifying the migration landed

Run this after `0001` and `0002`. It should report 13 tables, 27 services,
10 referral sources, and RLS enabled everywhere.

```sql
select
  (select count(*) from pg_tables
     where schemaname = 'public'
       and tablename in ('app_users','companies','contacts','properties','services',
                         'referral_sources','opportunities','opportunity_services',
                         'referrals','files','website_inquiries','opportunity_notes',
                         'opportunity_status_history'))            as tables_created,
  (select count(*) from services)                                  as services_seeded,
  (select count(*) from referral_sources)                          as referral_sources_seeded,
  (select count(*) from pg_tables
     where schemaname = 'public' and not rowsecurity)              as tables_without_rls,
  (select count(*) from storage.buckets where id = 'proposal-uploads'
     and public = false)                                           as private_bucket;
```

Expected: `13 | 27 | 10 | 0 | 1`.

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
