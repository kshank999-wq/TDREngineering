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

## Creating the first admin user

1. Supabase dashboard → Authentication → Users → **Add user**. Use a
   TDR-controlled address and a strong password.
2. Run in the SQL editor, substituting the new user's id and email:

```sql
insert into app_users (id, email, full_name, role)
values ('<auth-user-uuid>', 'owner@tdrengineering.com', 'TDR Owner', 'owner');
```

Per spec §2, create **at least two** owner-role accounts controlled by TDR so
no single person can be locked out of the database.

## Backups

Supabase takes automated backups on paid plans. Spec §15 also requires
*periodic independent data exports* — see `docs/BACKUP-AND-RECOVERY.md`.
