# Job files

Files attached to a job: deliverables, field data, what the client supplied,
and correspondence. Uploaded from the job record, downloaded through
short-lived signed links.

---

## The upload does not go through the website

Vercel caps a serverless request body at **4.5 MB**. A point cloud is three
orders of magnitude past that, so any design that streams file bytes through a
server action is broken for the files TDR actually needs to move.

So it doesn't:

1. The browser asks the server for a **short-lived signed upload URL**.
2. The browser **PUTs the file straight to storage** with it.
3. The server records the metadata row, after checking the object really
   landed.

The application never sees the bytes. Downloads work the same way in reverse —
a signed link is minted when you click, not rendered into the page, so it can't
be scraped from the HTML and it stops working after five minutes.

**Limit: 5 GB per file.** Anything larger needs splitting, or it belongs on the
NAS with a link recorded against the job.

## Client visibility is the portal gate

Every file has `client_visible`, and it **defaults to false**. A file is
internal until somebody deliberately shares it.

When the client portal is built it will read that column and nothing else. The
decision to expose a file is made once, by a person, on this screen — never
inferred later from a folder name, a file extension, or a category.

The **Share** / **Unshare** button on each file is that decision. The upload
form has a "Share with the client" checkbox for when you already know.

## Categories

| Category | What belongs there |
| --- | --- |
| **Deliverable** | The signed drawing, the report — what the client is owed |
| **Working file** | Field data, calcs, drafts |
| **Reference** | What the client or a third party supplied |
| **Correspondence** | Letters, approvals, email records |

The distinction that matters is deliverable vs working. The rest is filing.

## Removing a file

**Remove** archives; it does not delete. The metadata row and the bytes both
stay, and sharing is switched off. "I removed the wrong drawing" should be
recoverable — ask and it can be restored.

## Where the bytes live

Today: **Supabase Storage**, private `job-files` bucket, staff-only by RLS.

That is the right place to start — it already exists, it is already backed up
with the database, and it needed no new account. It is **not** where this
should end up at volume. Supabase charges for egress, and a surveying firm
ships large files repeatedly; a client re-downloading a 5 GB scan several times
is exactly the usage that produces a surprise bill.

**Cloudflare R2 is the likely destination**: zero egress fees, about
$0.015/GB/month to store. A terabyte of job archives is roughly $15/month and a
client downloading it ten times costs nothing extra. Backblaze B2 is the
cheaper runner-up.

The migration is designed to be gradual, not a cutover. `files.storage_provider`
is recorded **per row** (a deliberate choice in `0001`, spec §19), so files can
move one at a time while old ones keep resolving from Supabase. All the storage
logic sits behind `src/lib/storage/job-files.ts`.

### And the NAS

The NAS should stay the working master — CAD and raw scans at LAN speed, which
is the only way AutoCAD is tolerable. What the website serves should be a
**one-way sync** of deliverables into cloud storage.

The website should never link directly to the NAS:

* **Bandwidth.** Office upload speed becomes the ceiling on every client
  download. A 5 GB scan over a 20 Mbps upload is ~35 minutes, saturating the
  pipe the field staff are working through.
* **Availability.** A power cut or ISP outage kills every file link on the
  site.
* **Attack surface.** An internet-exposed NAS holding every job TDR has ever
  done is how small firms get ransomwared.

---

## Setup

`supabase/migrations/0007_job_files.sql` is applied. Nothing else is needed —
the bucket, policies and views are all created by it.

To confirm:

```sql
select
  (select count(*) from information_schema.columns
     where table_name='files'
       and column_name in ('job_id','category','client_visible','label'))   as new_file_columns,
  (select count(*) from pg_views where schemaname='public'
     and viewname in ('v_job_files','v_job_file_totals'))                    as file_views,
  (select count(*) from storage.buckets
     where id='job-files' and public = false)                                as private_bucket,
  (select count(*) from pg_policies where schemaname='storage'
     and tablename='objects' and policyname like 'job files%')               as storage_policies;
```

Expected: `4 | 2 | 1 | 4`.

## Security

* The `job-files` bucket is **private**. There is no anon policy on it at all.
* Staff read, insert, update and delete are each gated on `is_staff()`, in
  storage as well as in the `files` table.
* Both views are `security_invoker`, so RLS on `files` decides what any caller
  sees. Verified against PostgreSQL 16 that a `client`-role user and an
  anonymous caller each see zero rows, grant or no grant.
* Deleting a job cascades to its file rows.

## What is not built

- **No live upload test.** The signed-URL upload path is written against
  Supabase's documented API but has not been exercised against production from
  this environment. Upload one small file and confirm it downloads before
  trusting it with a deliverable.
- No versioning. Re-uploading a file of the same name creates a second file
  rather than superseding the first — the path is timestamped, so nothing is
  overwritten, but nothing links the two either.
- No folders. Category and label are the organising tools.
- No bulk download or zip.
- No virus scanning on upload.
- No NAS sync yet — that is a script on an office machine, not part of this
  application.
