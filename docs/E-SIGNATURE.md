# Proposals and electronic signature

How TDR writes a proposal, sends it, and gets it signed — and what makes that
signature worth anything afterwards.

> **Not legal advice.** This is built to record the facts that the federal
> ESIGN Act and UETA are generally understood to turn on. Whether those facts
> are sufficient for the contracts TDR actually sends is a question for TDR's
> attorney, not for this document. Have them read this page.

---

## A request is not a proposal

Two different documents, with two different authors:

| | Written by | Where |
| --- | --- | --- |
| **Proposal request** | The client, on the website form | **Proposal requests** in the menu |
| **Proposal** | TDR | **Proposals** in the menu |

Until now only the first existed, which is why there was nothing to sign.

One request can have several proposals over time — a revised fee is a *new*
proposal, because the old one is the record of what was offered then. A
proposal can also exist with no request at all, because work arrives by phone.

## Writing one

From a proposal request, **Write a proposal**. It starts a draft with the site
address as the title and the client's description as the scope.

Fill in scope, **what is not included**, terms, a validity date, and fee lines.
Exclusions get their own field on purpose: that is what gets argued about
later, and a field is harder to forget than a paragraph.

You can also **attach TDR's own proposal PDF**. Everything still works with no
attachment — the fields above are a complete proposal — but if the real
document lives in Word, attach it and the client gets both.

## Sending it

**Send and lock.** Two things happen, and both matter:

1. **The document freezes.** Scope, fee, exclusions, terms, validity and the
   attachment can no longer change. A signature on a document that can still be
   edited is worth nothing, so the database itself refuses the change — not the
   screen, the database. To revise, withdraw and issue a new proposal.
2. **You get a link.** Nothing is emailed. TDR's transactional email is not
   reliably configured yet, and a proposal that silently fails to send is worse
   than none — the client waits and nobody knows. Send the link however you
   already talk to that client. **It is shown once and never stored.**

The link lasts 60 days by default. You can issue another at any time, revoke
any of them individually, and see which have been opened and how often.

## What the client sees

A page with the proposal on it, a **Download the proposal** button if there is
an attachment, and a signature block. No login — nobody creates an account to
accept a proposal.

To sign they type their name and tick **two separate boxes**: one saying they
intend to sign, one consenting to do business electronically. Both start
unticked. A pre-ticked box is not consent and "by continuing you agree" is not
intent; the whole value of the record is that the person did something
deliberate.

They can also **decline**, with a reason. "They never replied" and "they said
no on the 14th" are different facts, and only one of them is useful.

## What is recorded

| Recorded | Why |
| --- | --- |
| Typed name, email, job title | Attribution |
| The address the link was sent to | The difference between "somebody typed this name" and "the person we emailed typed this name" |
| Both acknowledgements | Intent, and consent to transact electronically |
| **The exact disclosure text shown** | Consent to wording nobody kept a copy of is not evidence |
| **A hash of the exact document** | Ties the signature to what was on screen |
| **A frozen copy of the document** | ESIGN and UETA require the record be retained and reproducible. Rebuilding it later from rows that have moved is not the same as keeping it |
| Date, time, IP address, browser | Attribution |
| Every open of the link, and when | Corroboration |

The audit trail is **append-only**. Nobody signed in — owners included — can
edit or delete a signature or a trail entry. That is the point of having them.

## After acceptance

The proposal reads **Accepted**, the request moves to **Won**, and the screen
prompts you to create the job.

**The job is not created automatically**, deliberately. A signature must never
fail because job creation did, and a job appearing on the board without anybody
at TDR knowing is how work gets missed. One click, using the conversion that
already existed.

---

## The security model

### The link is a credential

There is no login, so the URL is the only thing proving the person opening it
is the person TDR sent it to. It is treated accordingly:

* 32 random bytes — 256 bits, not a guessable id.
* **Only its SHA-256 is stored.** The raw token exists in the link and nowhere
  else, so a copy of the database, a backup on a laptop, or a leaked query log
  lets nobody sign anything.
* It is hashed in the application, so the secret never travels to the database
  and cannot appear in a query log.

### `anon` reaches nothing

Same design as the client portal. The public page has no database access at
all: it reaches a server route, which holds the service role and calls
`proposal_for_signing()` *after* hashing the token. Those functions are
granted to `service_role` alone — not even signed-in staff can call them,
because staff have no business signing on a client's behalf.

The functions also **choose the columns**. `notes` and the internal ids are
never selected, so nothing internal can leak through a careless `select *` in
a route written later.

### Every failure gives the same answer

Expired, revoked, withdrawn, never existed — all produce the same "no longer
available" page. Telling an unknown visitor which it was tells them whether
they have found a real link.

## Verified

Against PostgreSQL 16, and then end-to-end against production with probe data
that was deleted afterwards:

| Test | Result |
| --- | --- |
| Totals derive from the lines, and re-derive when tax changes | ✅ |
| A sent proposal's fee, title, scope or attachment cannot change | refused by trigger |
| Lines cannot be added, edited or deleted after sending | refused by trigger |
| Internal notes still editable after sending | ✅ |
| A draft is unreachable even with a valid token | 0 rows |
| A withdrawn proposal is unreachable | 0 rows |
| One client's token reaching another's proposal | 0 rows |
| Revoked token, expired token, unknown token | 0 rows each |
| Opening the link is recorded once, counted every time | 1 event, 3 views |
| Signing with a blank name | refused |
| Signing an expired proposal | refused, with the date |
| Signing twice | refused, clean message |
| Declining an accepted proposal | refused |
| A signature with intent or consent false, or an empty name | refused by constraint |
| Two signatures on one proposal | refused by unique index |
| Status moving backwards (accepted → sent, declined → sent) | refused |
| Skipping a state (draft → accepted) | refused |
| `anon` reading any of the five tables **with real rows present** | 0 rows each |
| `anon` or `authenticated` calling any signing function | no privilege |
| `service_role` calling them | ✅ |
| Supabase security advisor | no findings on these functions |

Two real defects were found this way and fixed:

* An accepted proposal could be walked back to `sent`, and `decline_proposal`
  would then overwrite a **signed** proposal as declined. Status is now
  forward-only and accepted/declined/withdrawn are terminal.
* Revoking the signing functions from `PUBLIC` stripped `service_role` too,
  because it inherits like every other role — `BYPASSRLS` skips row policies,
  not `EXECUTE`. The signing page would have failed the first time a client
  opened a link. The re-grant is now explicit and commented.

`npm run check:esign` covers the primitives in CI: token entropy and hashing,
document-hash stability under key reordering, that every field of the offer
moves the hash, that amounts are not passed through a float, and the consent
record's contents. Verified in both directions — breaking the hash's key sort
makes it fail.

## What is not built

- **Nothing has been signed through the live site yet.** The database path is
  verified against production; the browser path is not. Send one proposal to
  your own address and sign it before sending one to a client.
- No countersignature by TDR. The record is the client's acceptance of TDR's
  offer.
- No emailing. The link is handed over by staff.
- No PDF of the signed proposal. The page is the record; the frozen snapshot
  behind it is the evidence.
- No reminders for a proposal that has been sitting unopened.
- Proposals are not visible in the client portal, only through their link.
