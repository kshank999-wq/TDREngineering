# Prospect lists

Lists of people to market to, built out of the contacts already in the
database, with one rule that overrides everything else: somebody who asked not
to be emailed is never emailed.

> **Not legal advice.** This records the facts CAN-SPAM is generally understood
> to require around opt-out. Whether TDR's actual sending practice complies —
> what the emails say, who is on the lists, where they came from — is a
> question for TDR's attorney.

---

## A prospect is a contact

There is no separate address book. A list is a **grouping of contacts** — the
same records that carry jobs, invoices and portal logins.

That matters practically: when a prospect eventually accepts a proposal, they
do not need re-entering, and their history is already there. A parallel
"marketing contacts" table would mean two records for the same person, drifting
apart the first time somebody fixed a phone number in one of them.

## The one rule

**The do-not-email list is global and it outranks every list.**

When somebody unsubscribes, they are unsubscribed from everything — not from
one list. Adding them to a brand new list afterwards does not make them
mailable again. Nothing in the system ever asks "is this person on this list";
it asks "may this person be emailed", and that question is answered by the
database in one place.

A per-list opt-out is how people get re-mailed after unsubscribing, and it is
the most common way a small firm ends up in trouble.

### Unsubscribes cannot be undone

| Reason | Can it be lifted? |
| --- | --- |
| Unsubscribed | **Never**, by anybody, at any access level |
| Reported spam | **Never** |
| Bounced | Yes — a full mailbox is not a request to stop |
| Added by staff | Yes |

The database refuses to delete a permanent opt-out, and refuses to downgrade
one into a liftable reason. That is not a screen hiding a button — it is a rule
the database enforces against everyone, including an owner and including
direct SQL. *(Verified: it refused me, as superuser, during production
testing.)*

Somebody can always opt in again themselves. That is a new consent record, not
an administrator overriding an old one.

---

## Using it

**Prospects** in the menu.

### Importing a spreadsheet

Upload a CSV with an email column. Headers are matched by meaning, so
`Email Address`, `E-Mail`, `Primary Email` and `EMAIL` all work, as do
`First Name` / `Given Name` / `fname`, `Organization` / `Company` / `Firm`.

You get a **preview before anything is imported**: how many people are ready,
which columns were recognised, how many rows have no usable address, and how
many are already opted out. A prospect list is hard to un-import once the rows
are mixed in with real contacts.

People already in the database are **matched, not duplicated** — that is the
whole reason lists are membership over contacts.

Every import is recorded, so "where did this person come from" has an answer a
year later. Purchased and scraped lists are the usual cause of a complaint, and
knowing which batch somebody arrived in is how that gets traced.

### Exporting

Two buttons, deliberately:

* **Download mailable** — only people who can be emailed. Suppressed addresses
  are excluded by the database, not by the screen.
* **Download everyone, including opt-outs** — for reconciling against your mail
  provider. The filename says so, because a file called `prospects.csv` that
  quietly contains opt-outs is a loaded gun in somebody's downloads folder.

Cells are escaped against formula injection (`=`, `+`, `-`, `@`), because these
files get opened in Excel and the names came from a spreadsheet somebody else
prepared.

### If you send through an outside service

Unsubscribes happen **there**. Pull them back with **Import opt-outs from your
mail provider** on the do-not-email screen, or an export from this system will
contain people who already opted out.

---

## Sending

**This system does not send bulk email.** That is deliberate, and worth
understanding before you change it.

TDR's transactional email — proposal notifications, portal invites — depends on
the domain's sending reputation. Marketing email attracts spam complaints in a
way transactional email does not, and complaints on a shared domain degrade
delivery for *everything*. The failure mode is that proposal notifications
quietly start landing in spam folders, which is far more expensive than any
mailing is worth.

The recommendation: send through a dedicated provider, on a **subdomain**
(`news.tdrengineering.com`), separate from the address proposals go out from.
Export from here, send there, import the opt-outs back.

### Unsubscribe links

The export includes a working unsubscribe link per person once
`MARKETING_UNSUBSCRIBE_SECRET` is set in Vercel. Until then the column is
omitted and the screen says so, rather than exporting a list that cannot
legally be mailed.

**Set that secret once and never change it.** It signs every link; rotating it
breaks every unsubscribe link already sitting in somebody's inbox, and an
opt-out link that stops working is the specific failure CAN-SPAM cares about.

The link needs no login and asks no questions — one button, no "are you sure",
no survey. Every extra step between somebody wanting out and being out raises
the chance they hit "report spam" instead, which hurts TDR more than losing
one prospect.

---

## Verified

Against PostgreSQL 16, then end-to-end against production with probe data that
was deleted afterwards:

| Test | Result |
| --- | --- |
| One unsubscribe takes effect on **every** list the person is on | ✅ |
| Adding a suppressed address to a brand new list does not revive it | not mailable |
| Deleting an unsubscribe | refused by trigger |
| Downgrading an unsubscribe to a liftable reason | refused by trigger |
| Lifting a bounce | ✅ |
| A bounce escalating to an unsubscribe, then becoming permanent | ✅ |
| The first suppression date survives a later re-suppression | ✅ |
| Blank, null, and malformed addresses | rejected |
| Mixed-case and padded addresses | normalised, matched case-insensitively |
| Archived contacts and contacts with no address | never mailable |
| Two lists sharing a name | refused (case and whitespace insensitive) |
| `anon` reading any table or view, **with real rows present** | 0 rows each |
| A signed-in **client** calling the suppression function | refused |
| The public opt-out path | ✅ |

`npm run check:import` covers CSV reading in CI — quoted fields containing
commas, escaped quotes, embedded newlines, a UTF-8 BOM, CRLF endings, header
aliases, and name splitting. Verified in both directions: breaking quoted-field
handling makes it fail.

### A defect found during this work

`suppress_email()` was initially callable by **any signed-in user** with a
caller-supplied reason — so a client portal login could have permanently
suppressed arbitrary addresses, unremovably. Supabase's security advisor
flagged it. It is now split in two: a staff function that checks `is_staff()`
inside, and a public one that takes an address and nothing else.

## What is not built

- **Nothing has been imported through the live site yet.** The database path is
  verified against production; the browser upload is not. Import a small test
  file first.
- No bulk sending, by the reasoning above.
- No open or click tracking.
- No automatic bounce handling — bounces are imported, not detected.
- No signup form for people to join a list themselves.
- No segments or saved filters. A segment is a new list today.
- No per-list unsubscribe. By design: opting out means opting out.
