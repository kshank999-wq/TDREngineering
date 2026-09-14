# Client portal

The first time somebody outside TDR's office gets a login. One mistake here
means client A downloads client B's survey, so this is written down in more
detail than anything else in the system.

---

## The design, and why

### Clients get no access to any base table

The obvious approach — add a client `SELECT` policy to `jobs` — is **wrong**.
RLS filters rows, not columns. A client who could read their own job row could
also read `jobs.notes`, which is where TDR's internal working notes live. Same
for `invoices.notes`, `jobs.contract_amount`, who the job is assigned to.

So there are **no client policies on `jobs`, `files`, `invoices` or
`payments`**. A client querying those tables directly gets nothing, because
nothing grants it. Verified: a signed-in client reading `jobs` sees `0`.

What they can read is four purpose-built views that select only client-safe
columns:

| View | Shows |
| --- | --- |
| `v_portal_jobs` | Number, name, status, dates, site address |
| `v_portal_files` | Only files marked `client_visible` |
| `v_portal_invoices` | Non-draft invoices, totals, balance, state |
| `v_portal_payments` | What has been received against those invoices |

Absent from `v_portal_jobs`, deliberately: `notes`, `contract_amount`,
`assigned_to`, `purchase_order`, `created_by`.

### The views bypass RLS, so their WHERE clause *is* the boundary

These are `SECURITY DEFINER` views — they run as the owner. That is what lets
them read tables the client cannot. It also means **the filter in the view is
the only thing standing between one client and another's work**.

Every one of them filters through a single predicate, `client_can_see_job()`.
There is exactly one copy of it on purpose: one thing to get right, one thing
to audit, one thing to change.

**Because the views bypass RLS, they are revoked from `anon`.** An anonymous
grant here would be a public read of every job in the database. Verified in
production: `0` anon grants.

### What a client can see

* Jobs where they are the **named contact**.
* Jobs belonging to **their company** — but only if `company_access` is set on
  their grant. **Off by default.** An architect at a firm often should see
  everything the firm has commissioned, but that is a decision somebody makes
  per person, not an assumption the software makes for them.
* Files on those jobs where `client_visible` is true. That column has existed
  and defaulted to false since `0007`, so switching the portal on exposes
  nothing that was not already deliberately shared.
* Non-draft invoices on those jobs, and payments against them.

### Downloads never touch the client's own credentials

Clients have no storage access at all. A download works like this:

1. Read the file through **the client's own session**, from `v_portal_files`.
   If the database will not return that row — wrong client, not shared, grant
   switched off — there is nothing to sign and the action stops.
2. Only then does the service role mint a signed URL, valid five minutes.

Written in that order deliberately: the service-role client is never reached
with an id that has not already passed the database's own check.

Links are fetched on click rather than rendered into the page, so a signed URL
never sits in the HTML.

---

## Granting access

On a **person's** client record (not a company), the **Client portal** panel.
Enter their email, decide on company access, and click.

That creates a Supabase auth user, an `app_users` row with role `client`, and
the grant — then returns **a link** for them to set a password.

**It returns a link rather than sending an email**, because TDR's transactional
email is not reliably configured yet, and an invitation that silently fails to
send is worse than none: the client waits and nobody knows. Send it however you
already talk to that client. It is shown once and not stored.

### Revoking is immediate

Switching access off sets `is_active = false`, which `client_can_see_job()`
checks on **every query**. The next thing they click returns nothing. The row
is kept so it stays clear who had access and when.

---

## Verified

Against PostgreSQL 16, with three real client accounts — Dan at Dans Arch, Pat
at the same firm with company access, Rita at a rival firm:

| Test | Result |
| --- | --- |
| Dan sees his own job, his shared file, his sent invoice | ✅ |
| Dan reading `jobs`, `files`, `invoices`, `payments`, `contacts`, `companies`, `opportunities`, `job_notes` directly | **0 rows each** |
| Dan reading the staff views (`v_job_board`, `v_invoice_ledger`, `v_job_files`, `v_client_directory`) | **0 rows each** |
| Dan requesting the rival's job, invoice and file **by id** | **0 rows each** |
| Dan inserting a payment on the rival's invoice | refused by policy |
| Dan inserting a job, a file row, or a portal grant for himself | refused by policy |
| Dan updating a job, a file's visibility, or his own `company_access` | 0 rows affected |
| Dan promoting himself to `owner` in `app_users` | 0 rows affected |
| Pat, with company access, sees both Dans Arch jobs — and not the rival's | ✅ |
| Rita sees only her own | ✅ |
| Dan after `is_active = false` | jobs 0, files 0, invoices 0 |
| Anon reading any portal view, or calling the gate function | permission denied |
| Staff unaffected — 3 jobs, 6 files, 6 invoices | ✅ |

Note the difference between "0 rows" and "refused by policy" above. Both are
tested, because a `0` can mean RLS filtered a subquery rather than that a write
was actually denied. The write tests use literal ids to remove that doubt.

## What is not built

- **The invite flow has never run against the live auth API.** `createUser`
  and `generateLink` are written against Supabase's documented admin API but
  are unexercised from this environment. Grant access to one test address and
  confirm the link works before giving it to a real client.
- No self-service signup. Access is granted by staff, always.
- No client uploads. Clients read; they do not write.
- No notifications when a file is shared.
- No PDF invoice to download — the portal shows the figures, not a document.
- No per-file sharing with a specific person. Sharing is per job.

## If something looks wrong

The whole model reduces to one function. To see exactly what a given client
can reach:

```sql
select j.job_number, j.name
  from jobs j
 where client_can_see_job(j.id);
```

Run it while impersonating nobody and it returns nothing, which is itself the
right answer.
