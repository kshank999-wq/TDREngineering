# TDR Engineering — Phase 1

Public website, Request-for-Proposal system, proposal database and internal
proposal view for [tdrengineering.com](https://www.tdrengineering.com).

Built to the *TDR Engineering Phase 1 Website Development Specification*
(v1.0, 19 August 2026). Everything in this repository is Phase 1 scope only —
the full CRM, client portal, project management, NAS integration, marketing
automation, QuickBooks/Accountrix integration and AI assistant are explicitly
out of scope (spec §17) and must not delay launch.

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Source control | GitHub | TDR-owned repository (spec §2) |
| Application | Next.js 15 · React 19 · TypeScript | App Router, server components, static generation |
| Styling | Tailwind CSS v4 | Design tokens in `src/app/globals.css` |
| Hosting | Vercel | Preview deployments, SSL, CDN, production |
| Database | Supabase / PostgreSQL | Business data, auth foundation, Row Level Security |
| Storage | Supabase Storage | Private bucket for proposal attachments |
| Transactional email | Provider-agnostic (`src/lib/email/send.ts`) | Resend today, swappable without touching call sites |

Email *hosting* is independent of website hosting: the site runs on Vercel
while `@tdrengineering.com` mailboxes live with Google Workspace or Microsoft
365. See `docs/EMAIL-MIGRATION.md`.

---

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in Supabase + email values
npm run dev                    # http://localhost:3000
```

The public site renders without any environment variables. The proposal form
and internal view need Supabase; the login page says so plainly rather than
failing with a 500 when it is unconfigured.

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run archive:crawl` | Phase 1A legacy site archive (see below) |

---

## Repository layout

```
src/
  app/                       Routes (App Router)
    page.tsx                 Homepage — hero, survey comparison, services, …
    services/[code]/         Generated page per service in the catalog
    3d-scanning/             Reality-capture capability page
    questions/               Searchable Knowledge Center
    request-a-proposal/      RFP form (no login required)
    contact/                 General contact form
    admin/                   Protected internal proposal view
    api/proposals/           RFP intake — validation, spam, DB, storage, email
    api/inquiries/           Contact-form intake
    sitemap.ts robots.ts     SEO basics
  components/                UI, hero, survey comparison, forms
  content/                   Service catalog, FAQs, referral sources, redirects
  lib/                       Supabase clients, validation, intake, email, spam
  middleware.ts              Session refresh + /admin gate
supabase/migrations/         Database schema and storage policies
scripts/archive-site.ts      Phase 1A crawler
docs/                        Runbooks — ownership, archive, email, launch, backup
```

`src/content/` is where non-engineers can safely change copy: service
descriptions, FAQ answers, referral sources and the legacy redirect map are all
plain data files.

---

## The four Phase 1 workstreams

### 1A — Archive the existing site *(do this first)*

```bash
LEGACY_SITE_URL=https://www.tdrengineering.com npm run archive:crawl
```

Writes `archive/` with every page's HTML, every referenced asset, an
`inventory.csv` migration table, and `links.csv` for redirect mapping. Nothing
should change on DNS until this exists and is stored somewhere TDR controls.
Full procedure: `docs/PHASE-1A-ARCHIVE.md`.

### 1B/1C — Infrastructure and public website

Apply `supabase/migrations/`, create the Vercel project, set environment
variables, deploy. `docs/DEPLOYMENT.md`.

### 1D — Proposal system

Already implemented here. The database row is the source of truth: a proposal
request is written to Supabase **before** any email is attempted, and an email
failure is logged but never fails the submission (spec §9).

### 1E — Email migration

Independent of this repository. `docs/EMAIL-MIGRATION.md`.

---

## What still needs TDR

Search the codebase for `TODO(tdr)` — each one marks a placeholder that needs a
real value before launch:

* Company phone, address and hours (`src/content/site.ts`)
* Official logo and brand colors
* Hero promotional video and poster (`heroMedia` in `src/content/site.ts`)
* Real before/after imagery for "Does Your Survey Look Like This?"
* Approved project examples (`src/content/projects.ts`)
* About-page company history and staff content
* The verified legacy redirect map (`src/content/redirects.ts`)

Every public marketing claim must be approved by TDR before publication
(spec §4).

---

## Documentation

| Document | Covers |
| --- | --- |
| `docs/OWNERSHIP-AND-ACCOUNTS.md` | Spec §2 — what TDR must own, and how to verify it |
| `docs/PHASE-1A-ARCHIVE.md` | Spec §3 — archiving and inventorying the legacy site |
| `docs/DEPLOYMENT.md` | Spec §2, §21 — Supabase, Vercel, DNS, environments |
| `docs/EMAIL-MIGRATION.md` | Spec §12, §13 — mailbox migration, SPF/DKIM/DMARC |
| `docs/SEO-AND-LAUNCH.md` | Spec §14, §21 — redirects, web basics, launch sequence |
| `docs/BACKUP-AND-RECOVERY.md` | Spec §15 — backups, exports, recovery drills |
| `docs/ARCHITECTURE.md` | Spec §11, §18–20 — data model and future-module notes |
| `docs/DEFINITION-OF-DONE.md` | Spec §22 — the launch checklist with current status |
| `supabase/README.md` | Applying migrations, RLS model, creating admin users |
