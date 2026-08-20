# Phase 1D/1E — Email Migration

**Spec §12, §13.** Email migration is independent from website hosting. The
website can be on Vercel while TDR email is hosted by Google Workspace or
Microsoft 365. The selected email account must be owned and controlled by TDR.

Two rules govern everything below:

1. **Existing `@tdrengineering.com` addresses keep working.** Nobody changes
   their address because the web host changed.
2. **Do not intentionally disrupt existing mail flow.** Mail that bounces during
   a cutover is business that is gone.

---

## Choosing a provider

Either is acceptable. Pick on the basis of what TDR already uses.

| | Google Workspace | Microsoft 365 |
| --- | --- | --- |
| Fits when | Staff already use Gmail/Drive | Staff already use Outlook/Office |
| Spam & phishing | Very strong default filtering | Strong, with Defender add-ons |
| Migration tooling | Data Migration Service (IMAP, Exchange, Gmail) | Exchange/IMAP migration in the admin center |
| Shared addresses | Groups (no extra licence) | Shared mailboxes (no extra licence) |

Whichever is chosen, the account must be registered to TDR with at least two
TDR super-administrators (`docs/OWNERSHIP-AND-ACCOUNTS.md`).

---

## Step 1 — Inventory before touching anything

Spec §12 requires all of this captured *before* cutover:

| Item | Record | Done |
| --- | --- | --- |
| Every mailbox | Address, owner, approximate size | ☐ |
| Aliases | Alias → destination mailbox | ☐ |
| Forwarders | Source → destination, internal or external | ☐ |
| Groups / shared addresses | e.g. info@, proposals@, and their members | ☐ |
| Historical mail | Volume, oldest message, storage used | ☐ |
| Mailbox sizes | Per mailbox, to estimate migration time | ☐ |
| Calendar data | Which staff rely on shared calendars | ☐ |
| Contacts | Personal and shared address books | ☐ |
| Mobile devices | Who has mail on a phone, and how it is configured | ☐ |
| Desktop clients | Outlook, Apple Mail, Thunderbird — POP or IMAP | ☐ |
| Software that sends as the domain | Website forms, CRM, invoicing, scheduling, scanners/copiers | ☐ |

That last row is the one most often missed. Anything sending as
`@tdrengineering.com` must be re-authorized against the new provider or it will
start failing SPF/DKIM checks and land in spam.

**Also export the current DNS zone in full before any change.** Every existing
MX, TXT, SPF, DKIM and CNAME record. This is the rollback path.

---

## Step 2 — Recommended migration procedure

The spec's sequence (§12), with the practical detail:

1. **Establish the new TDR-controlled provider.** Two TDR super-admins, MFA on
   both.
2. **Verify the domain.** A TXT record; does not affect mail flow.
3. **Create all users, mailboxes, aliases and groups** to match the inventory
   exactly. Every alias and forwarder. Missing one is a silently lost address.
4. **Begin historical mail migration** using the provider's migration service
   while the old system is still live and still receiving. This can run for days
   on a large mailbox — start early.
5. **Test sending and receiving** on the new platform using a test address,
   before any DNS change.
6. **Configure spam and security controls** (see below).
7. **Prepare DNS records** — write out the new MX, SPF, DKIM and DMARC values
   but do not publish the MX change yet.
8. **Lower DNS TTL in advance.** At least 24–48 hours ahead, drop the MX record
   TTL to 300 seconds. This is what makes a fast rollback possible.
9. **Perform the controlled MX cutover.** Early in the day, early in the week —
   never Friday afternoon. Change MX records only; leave everything else.
10. **Verify inbound and outbound mail.** Send to and from each mailbox, from an
    external address, in both directions.
11. **Verify mobile and desktop clients.** Reconfigure or re-authenticate every
    device in the inventory.
12. **Continue historical synchronization** if the provider supports a delta
    sync — it catches mail that landed in the old system during cutover.
13. **Keep the old environment available temporarily.** Do not delete mailboxes.
14. **Do not terminate the old service until migration is verified** and staff
    have worked normally on the new system for at least two weeks.

Raise the MX TTL back to a normal value (3600+) once things are stable.

---

## Step 3 — Email security and filtering

Spec §13. Long-standing public addresses attract significant spam, so this is
configuration work, not a checkbox.

### SPF

One — and only one — SPF record per domain. Merge all legitimate senders into
it:

```
v=spf1 include:_spf.google.com include:_spf.resend.com -all
```

(Replace with the actual provider includes. Microsoft 365 uses
`include:spf.protection.outlook.com`.)

Two SPF records is a misconfiguration that causes intermittent, hard-to-diagnose
delivery failures. Start with `~all` (softfail) during the transition and move
to `-all` once every legitimate sender is confirmed.

### DKIM

Enable DKIM signing in the provider's admin console and publish the selector
record it gives you. Enable it for the transactional email provider too —
that is a separate key on a separate selector.

### DMARC

Spec §13 asks for a *conservative initial policy followed by stricter
enforcement after legitimate senders are identified*. That means:

```
# Week 0 — monitor only, changes nothing about delivery
v=DMARC1; p=none; rua=mailto:dmarc@tdrengineering.com; fo=1

# After 2–4 weeks of clean reports
v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@tdrengineering.com

# Then ramp pct to 100, then
v=DMARC1; p=reject; rua=mailto:dmarc@tdrengineering.com
```

Do not start at `p=reject`. Read the aggregate reports first — they are how you
discover the copier, the invoicing system and the scheduling tool that nobody
remembered were sending as the domain.

### Provider filtering

Enable, in the provider's admin console:

* Spam detection (enhanced/aggressive pre-delivery scanning)
* Phishing and impersonation protection
* Malware and attachment scanning
* Spoofing and domain-impersonation protection (inbound mail claiming to be
  from `@tdrengineering.com`)
* Link protection / safe browsing
* Blocklists and allow lists
* Admin-level mail routing rules, plus per-user rules where useful
* Automatic categorization where it helps rather than hides mail

---

## Step 4 — Transactional mail must not ride on employee mailboxes

Spec §13: *Do not use employee mailboxes to send mass newsletters.*

This repository already follows the rule. Confirmation and notification email
goes through `src/lib/email/send.ts`, which uses a dedicated transactional
provider, and the `EMAIL_FROM` address should be on a **subdomain** —
`no-reply@mail.tdrengineering.com` — so its sending reputation is separate from
the reputation of the mailboxes staff depend on.

Future marketing campaigns must use a proper campaign-email system on that same
separated subdomain, never `info@` or a personal mailbox.

---

## Rollback

If inbound mail breaks after cutover:

1. Restore the previous MX records from the DNS export taken in Step 1.
2. Because TTL was lowered in Step 8, propagation is minutes, not hours.
3. Verify inbound delivery to the old system.
4. Diagnose before trying again.

Rollback is only fast if Step 1 (DNS export) and Step 8 (low TTL) were actually
done. Do not skip them.

---

## Verification checklist

| Check | Done |
| --- | --- |
| Every mailbox from the inventory exists on the new provider | ☐ |
| Every alias, forwarder and group recreated | ☐ |
| Inbound mail from an external address delivers to each mailbox | ☐ |
| Outbound mail from each mailbox reaches an external address | ☐ |
| Reply-to and display names correct | ☐ |
| Historical mail present and searchable | ☐ |
| Calendars and contacts migrated | ☐ |
| Every mobile device reconfigured | ☐ |
| Every desktop client reconfigured | ☐ |
| Every system that sends as the domain re-authorized | ☐ |
| Website proposal notifications arriving at `PROPOSAL_NOTIFICATION_TO` | ☐ |
| Prospect confirmation emails delivering to inbox, not spam | ☐ |
| SPF passes (single record, all senders included) | ☐ |
| DKIM passes for both mailbox and transactional mail | ☐ |
| DMARC published at `p=none` with reports arriving | ☐ |
| MX TTL raised back to normal | ☐ |
| Old service still available and not yet cancelled | ☐ |

Test deliverability with a tool such as mail-tester.com from each sending
system, not just from one.
