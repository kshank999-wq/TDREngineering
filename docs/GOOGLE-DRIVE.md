# Connecting a Google Drive for job files

Job files can live in TDR's own Google Drive instead of in cloud object
storage. This is the setup, and the reasoning behind where it is and is not the
right choice.

---

## The short version

There are two halves. The first is about twenty minutes in the Google Cloud
Console, and only you can do it — it needs a Google account TDR owns and terms
of service somebody has to accept. The second is one click on
**Internal → Settings → File storage → Connect Google Drive**.

Everything from **Step 1** down is the first half, click by click.

**These steps are also on that settings page itself**, under *Show me the
steps*, with the redirect URIs computed from the deployment you are actually
looking at and a button that generates the encryption key in your browser. Use
the screen rather than this file if you are doing the setup — this file is the
same content for whoever maintains the code, plus the reasoning below.

---

## Whether you want this at all

Drive is the familiar option, and familiarity is worth real money on a tool
staff use daily. It is not the fastest option for large files, and it is worth
knowing exactly where the line falls before you commit.

| | Google Drive | Cloudflare R2 (`docs/CLOUD-STORAGE.md`) |
| --- | --- | --- |
| Staff open a file | Drive's own web view — instant, any size | Download link from this site |
| Client downloads | Streams through this website | Direct from storage |
| Practical file size for a client download | Comfortable to a few hundred MB | No limit that matters |
| Cost | Whatever your Google Workspace plan already includes | ~$0.015/GB/month, free downloads |
| Feels like | The Drive everyone already uses | A bucket you never look at |

**The one real constraint:** Google Drive has no signed download link. Every
read of a Drive file needs an authorization header, and that header carries
access to every file this application has created — so it can never be handed
to a browser. For a client download, the bytes therefore pass *through* this
website rather than going straight from Google to the client.

That is fine for what clients actually receive: drawings, reports, signed PDFs,
the odd 200 MB survey deliverable. It is the wrong shape for a 10 GB point
cloud, where a serverless function will hit its time limit before the file
finishes.

**Staff never hit that limit.** Internally, a job file stored in Drive gets an
"Open in Drive" link — Google's own interface, no size ceiling, no streaming
through this site at all.

So: Drive for the working files and client deliverables, and if raw scan data
ever needs to go to clients at full size, R2 alongside it. The code supports
both at once — every file records where its own bytes live, so nothing has to
move when you change your mind.

### What it can and cannot touch

The app asks Google for the `drive.file` scope. That is the narrow one: it can
only see and modify **files it created itself**. Your existing Drive — every
contract, photo and spreadsheet already in there — is invisible to it, and
stays invisible even if something goes wrong at this end. That is deliberate,
and it is why the connect screen does not ask for full Drive access.

---

## Step 1 — Create a Google Cloud project

Use a Google account TDR owns, not a personal one. If you have Google
Workspace for `tdrengineering.com`, sign in with that.

1. Go to <https://console.cloud.google.com/>.
2. Top-left, click the project dropdown → **New project**.
3. Name it `TDR Engineering Website`. Leave the organization as offered.
4. **Create**, then make sure that project is selected in the dropdown.

There is no charge for any of this. The Drive API has no cost at the volumes a
survey firm generates.

## Step 2 — Turn on the Drive API

1. Left menu → **APIs & Services** → **Library**.
2. Search `Google Drive API`. Click it.
3. **Enable**.

## Step 3 — The consent screen

This is the screen you will see when you click Connect, so the names you type
here are the names you will read back.

1. **APIs & Services** → **OAuth consent screen**.
2. User type:
   - **Internal** if TDR has Google Workspace. Choose this if it is offered —
     it skips Google's verification review entirely.
   - **External** if TDR uses a plain Gmail account. This works fine; see the
     note about "unverified app" below.
3. Fill in:
   - App name: `TDR Engineering`
   - User support email: your address
   - Developer contact email: your address
4. **Save and continue**.
5. On the **Scopes** screen, click **Add or remove scopes** and tick:
   - `.../auth/drive.file`
   - `email`

   Both are on Google's "non-sensitive" and "restricted" lists respectively;
   `drive.file` is specifically the one that does *not* require a security
   assessment, which is why it was chosen.
6. **Save and continue** through to the end.
7. If you chose **External**: on the **Test users** screen, add the Google
   account you will connect with. Then leave the app in **Testing** — you do
   not need to publish it. A testing app works indefinitely for the users you
   list.

## Step 4 — Create the OAuth client

1. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth
   client ID**.
2. Application type: **Web application**.
3. Name: `TDR website`.
4. Under **Authorized redirect URIs**, click **Add URI** and add **both** of
   these, exactly:

   ```
   https://tdr-engineering.vercel.app/api/storage/google/callback
   https://www.tdrengineering.com/api/storage/google/callback
   ```

   The first is where the site runs today. The second is where it will run once
   DNS moves. Adding both now means the connection does not break on the day of
   the cutover. Google rejects anything not on this list, character for
   character — no trailing slash, and `https`.

   If you ever want to test this on a local copy, add
   `http://localhost:3000/api/storage/google/callback` too.
5. **Create**. Google shows a **Client ID** and a **Client secret**.

Leave that dialog open for the next step. If you close it, the client ID stays
visible on the Credentials page and the secret can be reset from there.

## Step 5 — Three values into Vercel

Go to <https://vercel.com/> → the TDR project → **Settings** → **Environment
Variables**. Add these three, each to **Production** and **Preview**:

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The client ID from step 4 (ends `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | The client secret from step 4 |
| `STORAGE_TOKEN_KEY` | A random value you generate — see below |

**Paste the client secret straight from Google into Vercel.** Do not send it
through email or chat on the way, and do not paste it back to me. Same rule as
the Supabase service role key and the Resend key.

For `STORAGE_TOKEN_KEY`, use any long random string of at least 32 characters.
If you want one generated properly, on a Mac open Terminal and run:

```
openssl rand -base64 32
```

Anything shorter than 32 characters is refused rather than silently accepted —
the connect button will tell you so instead of storing a weak key.

### What that key is for

When you connect, Google gives this site a **refresh token**: a credential that
does not expire and can keep getting new access to TDR's Drive indefinitely.
Storing that in plain text in a database is how a database leak turns into a
Drive leak. `STORAGE_TOKEN_KEY` encrypts it before it is written, so the row is
useless without the key, and the key lives in Vercel rather than in the
database.

Changing or losing the key **does not lose a single file**. It means the stored
token can no longer be decrypted, and you click Connect once more.

## Step 6 — Redeploy, then connect

Environment variables only reach the running site on the next deploy.

1. Vercel → **Deployments** → the newest one → **⋯** → **Redeploy**.
2. When it finishes, go to **Internal → Settings → File storage**.
3. Click **Connect Google Drive**.
4. Sign in with the TDR Google account and click **Allow**.

If you chose **External** in step 3, Google will show a screen saying the app
is not verified, with **Advanced → Go to TDR Engineering (unsafe)** hidden
behind a link. That warning is Google telling you it has not reviewed the app —
which is correct, it has not. You wrote it, or rather had it written, and it is
running on your own domain. Click through.

You should land back on the settings page with **Connected**, the Google
account address, and a folder called **TDR Job Files**.

---

## After it is connected

**New uploads go to Drive.** Files already in Supabase or R2 stay exactly where
they are and keep working — each file's row records its own storage, so
switching never strands anything.

**Everything lands in one folder**, `TDR Job Files`, in the connected account's
My Drive. You can move that folder anywhere in Drive, including into a shared
drive, and rename it; the connection follows the folder by its Drive ID rather
than by name or location.

**Staff see "Open in Drive."** Clients see a normal download, streamed through
this site.

**Deleting a job file here moves the Drive file to Drive's trash** rather than
destroying it, so a mistaken delete is recoverable for thirty days in Drive's
own bin.

---

## If something goes wrong

The settings page shows the last error from the connection, with the time. The
common ones:

| What you see | What it means |
| --- | --- |
| "Not ready to connect yet" | One of the three environment variables is missing, or the site has not been redeployed since you added them |
| `redirect_uri_mismatch` on Google's screen | The URI in step 4 does not match the address you are browsing from — check for a missing `www`, or `http` where it should be `https` |
| "That sign-in could not be verified" | You started the flow from an old browser tab or a bookmarked link. Start from the settings page |
| "This connection is not working" with a token error | Access was revoked on Google's side, or `STORAGE_TOKEN_KEY` changed. Click **Reconnect** |

**Revoking from Google's side:** <https://myaccount.google.com/permissions> →
`TDR Engineering` → **Remove access**. Do that if the site is ever compromised.
Nothing in Drive is deleted; this site simply stops being able to reach the
files it made.

**Disconnecting from this side:** the **Disconnect** button on the settings
page. It retires the connection and wipes the stored credential, leaves every
file in Drive untouched, and tells you first how many files will stop being
downloadable through the site until you reconnect.

---

## What this does not do

- It does not read anything already in your Drive. `drive.file` scope, by
  design.
- It does not share files with clients through Drive. Client access is decided
  by this application's own permissions, not by Drive sharing links — that is
  deliberate, since a Drive link, once sent, works for anyone who has it
  forever.
- It does not sync. Nothing watches Drive for changes; the site only knows
  about files it uploaded.

---

## For the record

| | |
| --- | --- |
| Scope requested | `https://www.googleapis.com/auth/drive.file`, plus `email` to record which account connected |
| Where the credential is stored | `storage_connections.refresh_token_enc`, AES-256-GCM |
| Who can see that column | Nobody through the API — the view staff read (`v_storage_connections`) omits it and exposes only a `has_token` flag |
| Who can connect or disconnect | Owner and manager only, enforced in both the route and the database |
| Contract tests | `npm run check:drive` — 55 checks over the encryption properties and the Drive client's error paths, no network |
