# Ownership and Account Control

**Spec §2.** TDR Engineering must directly own or retain full administrative
control of every critical production service. No outside developer may be the
sole owner or sole administrator of any production asset.

This is the single most important non-technical outcome of Phase 1. The website
can be rebuilt; a domain registrar account nobody at TDR can log into cannot.

---

## The rule

For **every** asset below:

1. The account is registered to a TDR-controlled email address — not a personal
   address, and not a developer's address.
2. At least **two** TDR people hold administrator or owner access, so a single
   person leaving or being unavailable never locks TDR out.
3. Billing is on a TDR payment method.
4. Recovery — backup email, recovery phone, MFA backup codes — points at TDR.
5. Any outside developer holds a *delegated* role that TDR can revoke, never
   the owner role.

MFA should be enabled everywhere it is offered. Store the recovery codes
somewhere a second TDR person can reach them.

---

## Asset checklist

Record the real values in TDR's password manager, not in this repository.

| # | Asset | Owner account | 2nd admin | MFA | Billing | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Domain registrar (tdrengineering.com) | | | ☐ | ☐ | ☐ |
| 2 | DNS hosting (registrar, Cloudflare, or Vercel DNS) | | | ☐ | ☐ | ☐ |
| 3 | GitHub organization | | | ☐ | ☐ | ☐ |
| 4 | GitHub repository (this one) | | | ☐ | n/a | ☐ |
| 5 | Vercel account / team | | | ☐ | ☐ | ☐ |
| 6 | Vercel project | | | ☐ | n/a | ☐ |
| 7 | Supabase organization | | | ☐ | ☐ | ☐ |
| 8 | Supabase project | | | ☐ | n/a | ☐ |
| 9 | Email provider (Google Workspace / Microsoft 365) | | | ☐ | ☐ | ☐ |
| 10 | Transactional email provider (Resend or equivalent) | | | ☐ | ☐ | ☐ |
| 11 | Google Analytics | | | ☐ | n/a | ☐ |
| 12 | Google Search Console | | | ☐ | n/a | ☐ |
| 13 | Cloudflare Turnstile (bot protection) | | | ☐ | n/a | ☐ |
| 14 | Cloud storage / backup destination | | | ☐ | ☐ | ☐ |
| 15 | Password manager holding all of the above | | | ☐ | ☐ | ☐ |

---

## Verifying control (not just assuming it)

For each asset, one TDR person should actually perform this test:

1. Log in from a TDR device using TDR credentials — not a shared link, not an
   invitation that someone else accepted.
2. Open the account's user/member list and confirm the TDR accounts hold the
   **highest** role available (Owner, not Admin, where the platform
   distinguishes the two).
3. Confirm the billing contact and payment method are TDR's.
4. Trigger a password reset to confirm the recovery email arrives at a TDR
   mailbox.
5. Tick the row above only after all four succeed.

If any step fails, that asset is not under TDR control yet regardless of what
anyone has said.

---

## Credentials that must never be in this repository

Spec §15: *secrets stored outside GitHub*.

* `SUPABASE_SERVICE_ROLE_KEY` — bypasses Row Level Security entirely
* `RESEND_API_KEY` (or the equivalent for whichever provider is chosen)
* `TURNSTILE_SECRET_KEY`
* Any database password, registrar API token or DNS API token

These live in the Vercel project's environment variables and in TDR's password
manager. `.env*` files are gitignored; `.env.example` documents the *names*
only.

If a secret is ever committed, rotate it — removing the commit is not enough,
because the value is already in the repository's history and in any clone.

---

## Offboarding an outside developer

When a developer's engagement ends:

1. Remove them from the GitHub organization, Vercel team and Supabase
   organization.
2. Rotate `SUPABASE_SERVICE_ROLE_KEY`, the transactional email API key and the
   Turnstile secret.
3. Deactivate their `app_users` row: `update app_users set is_active = false,
   archived_at = now() where email = '…';`
4. Remove their access from the email provider, analytics and Search Console.
5. Confirm no DNS, registrar or billing contact still points at them.
