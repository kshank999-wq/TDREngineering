# Merging duplicate clients

## Why duplicates happen

The proposal form creates a contact and a company from whatever a visitor
types. It de-duplicates on an exact email match — which catches nothing when
the same architect fills the form twice and leaves the email blank once.

So the same person arrives as *Dan Dan / DANS ARCH* and *Dan Dan / booboo*, and
the referral history TDR wants to measure (spec §1) is split across two records
that look like two different people.

This is not a bug in the intake. Refusing an inbound proposal request because
it resembles an existing record would violate spec §9 — the request must land.
The fix belongs after the fact, with a person deciding.

---

## Two ways in

### Possible duplicates

`/admin/clients` shows an amber **N possible duplicates — review** button when
there are any. It opens a page of candidate pairs, strongest signal first:

| Reason | How it is matched |
| --- | --- |
| Same email address | Exact match |
| Same phone number | Digits only, so `(818) 555-0100` matches `818-555-0100` |
| Same name | Case and spacing ignored |
| Similar name | Trigram similarity above 0.6 |

These are **suggestions from string matching, not findings**. Two people at one
firm really can share a phone number, and a father and son really can share a
name. Nothing merges on its own, and neither record is preselected. **Not a
duplicate — hide** removes a pair from the current view.

### From a client record

The detector only finds pairs that look alike. Two records for the same firm
filed under unrelated names — `booboo` and `DANS ARCH` — will never be matched
by string similarity, and only somebody who knows the client can say they are
the same.

For that, open the record you want to **keep** and use **Merge another record
into this one** in the right-hand column. The direction is fixed there: the
record you are looking at survives.

---

## What a merge does

Merging is quote-then-commit, like buying a shipping label. Before the button
that does it, you see the record about to be archived named, and a count of
what will move.

1. Everything attached to the archived record is repointed at the survivor:
   proposal requests, referrals, shipments, website inquiries, and — for a
   company — the people who work there.
2. Blank fields on the survivor are filled in from the other record. Anything
   already filled in is kept, because you chose that record.
3. `is_professional` becomes true if it was true on either. A professional on
   one record is a professional after the merge.
4. **Notes from both records are preserved**, concatenated with a line saying
   where the second set came from. Losing what somebody wrote down is not a
   merge, it is data loss.
5. The other record is **archived, never deleted**, with `merged_into_id`
   pointing at where it went.

The whole thing is one database function, so it is one transaction — either
every reference moves and the record is archived, or nothing changes. A merge
that moved four of five references and then failed would leave the data worse
than the duplicate it was fixing.

### It cannot be undone from the admin

There is no unmerge button. The archived record still exists with all its own
fields, and `merged_into_id` records where it went, so a merge can be traced
and unpicked in SQL — but the admin will not do it for you. Read the confirm
step before clicking.

To find what was merged into a record:

```sql
select id, first_name, last_name, email, phone, archived_at
  from contacts where merged_into_id = '<the surviving record id>';
```

---

## Authorization

Merging is staff-only, enforced in the database rather than only in the UI:

* `merge_contacts()` and `merge_companies()` raise *"Not authorized to merge
  client records"* unless `is_staff()`, so the check holds even if something
  reaches the RPC directly.
* `client_impact()` returns null rather than counts for a non-staff caller.
  It is `SECURITY DEFINER`, so it bypasses RLS and has to check for itself.
* All three are revoked from `public` and `anon`. Supabase grants execute on
  new public functions to `anon` by default, so the revoke is not optional —
  without it, an anonymous visitor could count a client's proposal requests.
* `v_duplicate_clients` is `security_invoker`, so it inherits the staff-only
  read policies on `contacts` and `companies`. A signed-in portal client sees
  zero pairs.

Verified against PostgreSQL 16: a user with the `client` role is refused the
merge, gets null from `client_impact`, and sees no duplicate pairs.

---

## Setup

Apply `supabase/migrations/0004_merge.sql` in the Supabase SQL editor. It is
idempotent. Then confirm:

```sql
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('merge_contacts','merge_companies','client_impact'))  as merge_functions,
  (select count(*) from pg_views
     where schemaname = 'public' and viewname = 'v_duplicate_clients')         as duplicates_view,
  (select count(*) from information_schema.columns
     where table_name = 'contacts' and column_name = 'merged_into_id')         as provenance_column,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('merge_contacts','merge_companies','client_impact')
       and has_function_privilege('anon', p.oid, 'execute'))                   as anon_can_execute;
```

Expected: `3 | 1 | 1 | 0`.

`anon_can_execute` must be **0**. Anything else means an anonymous visitor can
call the merge functions.

---

## What is not built

- No unmerge from the admin.
- Hiding a pair as "not a duplicate" lasts for the current page view only —
  it is not remembered, so the pair returns on reload. Persisting that needs a
  table of rejected pairs; worth adding if the same false match keeps coming
  back.
- Merging is one pair at a time. Three records for one person take two merges.
- Properties are not de-duplicated — only people and firms. Two records for the
  same parcel are a different problem, best keyed on APN.
