# Backup and Recovery

**Spec §15.** Database backups, periodic independent data exports, an
independent legacy-site archive, and an independent copy of important site
assets.

The distinction the spec draws matters: *provider* backups protect against
infrastructure failure. *Independent* exports protect against losing access to
the provider itself — a billing lapse, a locked account, a deleted project. TDR
needs both.

---

## What has to survive

| Asset | Where it lives | Backed up by |
| --- | --- | --- |
| Application source | GitHub | GitHub + every developer clone |
| Database (contacts, companies, properties, opportunities, referrals, files metadata) | Supabase Postgres | Supabase PITR + independent export |
| Proposal attachments | Supabase Storage | Independent export |
| Legacy website archive | TDR cloud storage / NAS | Its own copies (see below) |
| Brand assets — logo sources, photography, video masters | TDR storage | Its own copies |
| Environment variables and secrets | Vercel + password manager | Password manager export |
| Email | Provider | Provider retention + optional export |

---

## Database backups

**Provider-side.** In the Supabase dashboard, confirm daily backups are on and
enable Point-in-Time Recovery on a paid plan. Record the retention window here
once known: `__________`.

**Independent export.** Monthly, from a TDR machine:

```bash
# Full logical backup, schema and data
supabase db dump --db-url "$SUPABASE_DB_URL" -f tdr-db-$(date +%Y-%m-%d).sql

# Or with pg_dump directly
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges \
  -f tdr-db-$(date +%Y-%m-%d).sql
```

Store the dump in TDR-controlled storage. Keep twelve monthly copies.

**Business-readable export.** The internal proposal view has an **Export CSV**
button (`/admin/proposals` → Export CSV). It respects the current search and
status filter. A monthly full export gives TDR a copy of the proposal pipeline
that is readable without any database at all.

---

## Storage (proposal attachments)

Attachment bytes live in the private `proposal-uploads` bucket; the `files`
table holds the metadata that points at them. Both are needed to reconstruct a
submission.

Monthly:

```bash
supabase storage download --recursive ss:///proposal-uploads ./backup/proposal-uploads
```

Or use the dashboard's bulk download for smaller volumes. Keep the storage
export and the database dump from the same date together — separated, neither
is fully useful.

---

## Legacy site archive and brand assets

Spec §15 lists these as separate obligations from database backups.

* `archive/` from `npm run archive:crawl` — see `docs/PHASE-1A-ARCHIVE.md`
* Logo source files (vector), photography originals, video masters

Store each in **at least two** TDR-controlled locations: cloud storage, the NAS,
or an external drive held at the office. Neither belongs in this repository.

---

## Secrets

The password manager is the system of record for every credential in
`docs/OWNERSHIP-AND-ACCOUNTS.md`. Export an encrypted vault backup quarterly and
store it separately from the password manager account itself — otherwise losing
access to the manager loses the backup of the manager.

---

## Recovery procedures

### Bad deploy

Vercel → Deployments → the last known-good deployment → **Promote to
Production**. Immediate, no DNS change.

### Bad data change (accidental delete, bad bulk update)

Nothing in this schema hard-deletes: rows carry `archived_at` and are soft
-deleted. First try clearing it:

```sql
update opportunities set archived_at = null where id = '…';
```

If the data is genuinely gone, use Supabase Point-in-Time Recovery to restore to
a timestamp before the change.

### Total loss of the Supabase project

1. Create a new Supabase project under the TDR organization.
2. Apply `supabase/migrations/` in order.
3. Restore data from the most recent independent dump.
4. Restore attachments from the most recent storage export.
5. Update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` in Vercel and redeploy.
6. Recreate the admin users (`supabase/README.md`).

Recovery point is the age of the last independent export — which is the reason
the export cadence matters.

### Total loss of the Vercel project

Source is in GitHub. Create a new Vercel project, connect the repository, set
the environment variables from the password manager, deploy, repoint DNS.

---

## Schedule

| Frequency | Task | Owner |
| --- | --- | --- |
| Continuous | Supabase automated backups / PITR | Supabase |
| Monthly | Independent database dump to TDR storage | |
| Monthly | Storage (attachments) export | |
| Monthly | Proposal CSV export from the internal view | |
| Quarterly | Password manager vault export | |
| Quarterly | **Restore drill** — restore a dump into a scratch project and confirm the data is intact | |
| Annually | Re-verify every row in `docs/OWNERSHIP-AND-ACCOUNTS.md` | |

The restore drill is the one people skip. A backup that has never been restored
is an assumption, not a backup.
