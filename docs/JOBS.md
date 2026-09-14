# Jobs

The spine of everything after a proposal is accepted. Deliverable files,
invoices, payments and the client portal all attach to a job, so this is the
first thing built in Phase 2 and the thing the rest hangs off.

---

## A job is not a proposal with a flag on it

An **opportunity** records what TDR *quoted*: the services asked for, the
description the prospect typed, the price discussed. That is a historical
record and it has to stay true.

A **job** records what TDR is *doing*: when the crew goes out, who is drafting,
what was actually contracted, when it was delivered. Those move independently.
A proposal that rewrote itself as work progressed would destroy the record of
what was agreed — which matters when a client asks why the invoice differs from
the quote.

So they are separate tables, linked by `jobs.opportunity_id`.

**That link is optional in both directions.** Work arrives by phone and by
referral without ever passing through the website form, and those jobs are just
as real. A job with no opportunity is normal, not broken.

## Converting

The **Accept & create job** button on a proposal request creates the job,
carries over the client, company and property, names it from the site address,
and marks the proposal won. The proposal itself is otherwise untouched.

Once converted, that button is replaced by a link through to the job. Clicking
twice cannot produce two jobs — a unique index on `jobs.opportunity_id` refuses
the second insert at the database, so the guard holds even if the UI is
bypassed entirely.

`opportunities.project_number` is set to the job number so proposal search can
reach the job (spec §11).

## Status

| Status | Meaning |
| --- | --- |
| **Scheduled** | Accepted and on the board, no field work yet |
| **Field Work** | Crew is out |
| **Processing** | Calcs and drafting |
| **In Review** | Licensed review before anything leaves the office |
| **Delivered** | Deliverables sent to the client |
| **On Hold** | Stalled on something outside TDR's control |
| **Complete** | Closed out |
| **Cancelled** | |

These are the stages a survey actually moves through, not generic project
states. Field work and licensed review are distinct because nothing leaves the
office without a licensed surveyor signing off.

Changing status does three things automatically:

1. writes a row to `job_status_history`, attributed to whoever made the change;
2. stamps `delivered_at` the first time the job reaches **Delivered**;
3. stamps `closed_at` the first time it reaches **Complete** or **Cancelled**.

A trigger does this, so it holds no matter how the row is updated. Editing any
other field writes no history.

## Where things live

| | |
| --- | --- |
| `/admin/jobs` | The board. Defaults to open work, because the Monday-morning question is "what is live" |
| `/admin/jobs/<id>` | One job: client, site, dates, money, assignment, notes, status history |
| Client record | Jobs appear above proposal requests — what is happening now beats what was asked for |

## Security

Same model as everything else: staff-only, enforced by the database.

* `jobs`, `job_notes` and `job_status_history` are RLS-protected, readable and
  writable only when `is_staff()`.
* Verified against PostgreSQL 16 that a user with the `client` role sees zero
  jobs, zero notes, zero board rows, and is refused an insert by policy.
* `log_job_status_change()` is `SECURITY DEFINER` and therefore revoked from
  `public` and `anon`, per `0005`. It is a trigger function and needs no grant:
  PostgreSQL checks `EXECUTE` when a trigger is created, not when it fires.

## What attaches next

Nothing below is built. The job number is what each will hang off:

* **Deliverable files** — cloud object storage, with the NAS as the working
  master and a one-way sync. The website should never link to the NAS
  directly: office upload speed becomes the ceiling on every client download,
  an office outage breaks every link, and it exposes the machine holding every
  job TDR has ever done.
* **Invoices and payments** — tracked, not processed. Recording that a cheque
  arrived is a table; taking cards is Stripe and PCI scope.
* **Client portal** — the highest-risk piece. The moment external clients log
  in, one RLS mistake means client A downloads client B's survey.
* **Accounting export** — records flow out to QuickBooks, never back. This
  system owns invoice numbering.
