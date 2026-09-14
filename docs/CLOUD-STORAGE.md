# Cloud storage for job files

Where survey deliverables live, and how to set up the account.

---

## The short version

**Use Cloudflare R2.** Roughly $0.015 per GB per month, and — the part that
matters — **no charge for downloads, ever**.

Everything below is either the reasoning, or the fifteen minutes of clicking
that only you can do.

---

## Why not just stay on Supabase

Supabase Storage is fine for proposal PDFs. It is the wrong shape for a laser
scanning firm.

A single scan project runs to tens of gigabytes — `.e57`, `.las`, `.rcp`, point
clouds. Those files get uploaded once and then downloaded repeatedly: by you,
by the crew, by the client, by the client's architect. Supabase bills for
storage *and* for egress, and its storage tiers are built around web app assets
rather than survey data.

## Why R2 rather than the others

| | Storage / GB / month | Download cost | S3-compatible |
| --- | --- | --- | --- |
| **Cloudflare R2** | $0.015 | **$0** | Yes |
| Backblaze B2 | $0.006 | Free to 3× stored, then $0.01/GB | Yes |
| Wasabi | ~$0.007 | Free, with fair-use limits | Yes |
| AWS S3 | $0.023 | $0.09/GB | Yes (it is S3) |

Backblaze is cheaper to store. R2 is cheaper to *use*, and predictably so.

Take 500 GB of job files with 200 GB downloaded in a month: R2 is $7.50 and
that is the whole bill. AWS S3 would be $11.50 plus **$18 of egress**. At 2 TB
stored with 1 TB downloaded, R2 is $30 flat; S3 is about $136.

Backblaze would be cheaper than R2 at those volumes, and it is a perfectly good
choice. R2 wins on not having to think about it: there is no download threshold
to watch, no bill that jumps because a client re-downloaded a point cloud four
times. For a firm where nobody wants to be monitoring an egress dashboard, flat
and boring beats slightly cheaper.

**The code works with any of them.** It speaks the S3 protocol, not a vendor's
API, so switching later is four environment variables — which is also why the
recommendation is not load-bearing.

---

## Setting up the account — your part

I cannot do this bit. It needs an email, a password, a credit card and
accepting terms of service, and none of those are mine to give on TDR's behalf.
It is about fifteen minutes.

### 1. Create the Cloudflare account

Go to **dash.cloudflare.com/sign-up**. Use a TDR-controlled address — not a
personal one, and ideally not one person's mailbox. `admin@tdrengineering.com`
or similar.

> This is the same rule as every other account in `docs/OWNERSHIP-AND-ACCOUNTS.md`:
> TDR owns it, and at least two people at TDR can get into it.

### 2. Turn on R2

In the left sidebar, click **R2**. It will ask for a payment card even though
the first 10 GB each month are free. Add it.

Cloudflare will show your **Account ID** on the R2 overview page — a long hex
string. Keep that tab open; you need it in step 5.

### 3. Create the bucket

**Create bucket**. Name it `tdr-job-files`.

* **Location**: Automatic is fine. If it offers a hint, North America.
* **Storage class**: Standard.

Leave everything else alone. In particular **do not enable public access** —
the application hands out short-lived signed links instead, which is what lets
a shared file be un-shared later. A public bucket cannot be taken back.

### 4. Create an API token

R2 → **Manage R2 API Tokens** → **Create API token**.

* **Permissions**: *Object Read & Write*
* **Specify bucket**: `tdr-job-files` only — not "all buckets"
* **TTL**: no expiry

Click create. You will see:

* **Access Key ID**
* **Secret Access Key** — **shown once.** Leave the page and it is gone, and
  you make a new token.

### 5. Put the four values into Vercel

Vercel → your project → **Settings** → **Environment Variables**. Add these to
**Production** (and Preview, if you want uploads to work there too):

| Name | Value |
| --- | --- |
| `S3_ENDPOINT` | `https://<your-account-id>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | `tdr-job-files` |
| `S3_ACCESS_KEY_ID` | the Access Key ID from step 4 |
| `S3_SECRET_ACCESS_KEY` | the Secret Access Key from step 4 |

Then **redeploy** — environment variables only take effect on a new deployment.

> **The secret access key never goes in chat, email, or a document.** It reads
> and writes every job file TDR has. It goes from the Cloudflare page straight
> into the Vercel form. If it is ever exposed, delete the token in R2 and make
> a new one; that takes a minute and invalidates the old one immediately.

### 6. Check it worked

Open any job, upload a small file, and download it again. Then look in the R2
bucket — the object should be there under `jobs/<job id>/`.

If the upload fails, it is almost always one of: the endpoint missing
`https://`, the account ID wrong, or the deployment not redeployed yet.

---

## What happens to the files already in Supabase

**Nothing. They keep working.**

Every file records where its own bytes live. A deliverable uploaded to Supabase
last month and one uploaded to R2 tomorrow both download normally, side by
side, with nothing to migrate and no flag day.

That is deliberate. The alternative — move everything, then switch — means a
window where half of TDR's deliverables are unreachable, and no way back if the
new provider disappoints. Instead, switching providers changes where the *next*
upload goes and nothing else.

Turning cloud storage off again is just as easy: clear the variables and new
uploads return to Supabase, while the files already in R2 keep working as long
as the credentials remain.

### What does not move

Proposal attachments, proposal PDFs and marketing assets stay in Supabase
Storage. They are small documents, not survey data, and the cost argument that
justifies R2 for point clouds does not apply to a 2 MB flyer. Moving them would
be change without benefit.

---

## About the NAS

You asked originally whether this should be your office NAS instead. It should
not be the *primary* store, for one reason: a NAS is reachable from the office.
"Job files backed up and accessible anywhere" was the requirement, and that
means something reachable from a hotel, a client's conference room, and a phone
in a field.

The better arrangement is both — cloud as the working copy, NAS as a local
backup that syncs from it. `rclone` does this well and speaks R2 natively; it
runs nightly and costs nothing extra because R2 does not charge for downloads.
That gives you a copy in a data centre and a copy in the building.

Worth doing once there is enough data to be worth losing. Not needed on day
one.

---

## How it works, briefly

Bytes never pass through the website. Vercel caps a request body at 4.5 MB, and
a point cloud is three orders of magnitude past that, so:

* **Upload** — the browser asks for a short-lived signed URL and sends the file
  straight to R2. The server only writes the metadata row, and only after
  confirming the bytes actually arrived.
* **Download** — the server mints a signed link valid for five minutes, after
  the database has confirmed the person is allowed that file. Order matters:
  storage is never reached with a path the database has not already released.

The signing is implemented directly rather than via the AWS SDK — about a
hundred lines against roughly fifteen packages. It is verified in CI against
signatures produced by AWS's own presigner, including filenames with
apostrophes, spaces, percent signs and accents, because a survey deliverable is
not called `test.txt`.

That verification earned its keep: it caught a missing `X-Amz-Content-Sha256`
query parameter that produced signatures which looked perfectly well-formed and
would have been rejected by every provider.

## Verified

- Presigned PUT and GET match AWS's own `s3-request-presigner` exactly, across
  eight filenames including apostrophes, spaces, parentheses, percent signs,
  accented characters, plus and star.
- The secret key never appears in a generated URL.
- Both file views expose `storage_provider`, so downloads route per file.
- `v_portal_files` is still `SECURITY DEFINER` after the change, and `anon`
  still has zero grants on it — verified in production.
- `npm run check:storage` fails if the payload parameter is removed.

## Not yet done

- **Nothing has been uploaded to R2 yet**, because there is no account. The
  signing is verified against AWS's own implementation; what has not been
  exercised is a real bucket accepting a real file.
- No automatic move of existing Supabase files to R2. They work where they are;
  a bulk mover can be written later if the files are ever worth consolidating.
- No NAS sync. See above.
- No lifecycle rules — nothing expires or moves to cold storage automatically.
