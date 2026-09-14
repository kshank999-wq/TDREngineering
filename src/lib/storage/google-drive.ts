import "server-only";

/**
 * Google Drive, as a place to keep job files.
 *
 * WHAT DRIVE IS NOT
 *
 * It is not object storage. There is no presigned download URL: every read
 * needs an `Authorization` header, which means a browser cannot be pointed
 * straight at a private Drive file the way it can at S3. That single fact
 * shapes everything here:
 *
 *   upload    the server opens a RESUMABLE SESSION and hands the browser the
 *             session URL. That URL needs no header, so the bytes still go
 *             straight from the browser to Google — the 4.5 MB Vercel request
 *             cap is never in the path.
 *
 *   download  staff get a link to Drive's own web view. They already have
 *             access to the Drive; sending them there is faster than any proxy
 *             and has no size limit at all.
 *
 *             Clients do not have that access, so a portal download is
 *             streamed through the server. Fine for the PDFs and drawings
 *             clients actually receive; the wrong tool for a 10 GB point
 *             cloud, which is why staff never use that path.
 *
 * Everything is plain `fetch` against the REST API. The googleapis package is
 * tens of megabytes and this needs six calls.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/**
 * `drive.file` — access ONLY to files this application created.
 *
 * Deliberately not `drive` (everything) or `drive.readonly`. If this
 * application's credentials are ever compromised, the blast radius is the job
 * files it uploaded, not TDR's entire Drive: contracts, tax records, payroll,
 * everything else in there stays out of reach. Google also reviews the broad
 * scopes and not this one, which turns a weeks-long verification into nothing.
 *
 * The cost is that files moved into the folder BY HAND are invisible to this
 * application. That is the right trade: staff use Drive directly for those.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const OAUTH_SCOPES = [DRIVE_SCOPE, "email"].join(" ");

export type DriveError = { ok: false; error: string; status?: number };
export type DriveOk<T> = { ok: true } & T;
export type DriveResult<T> = DriveOk<T> | DriveError;

/**
 * Turns a Google error body into something a person can act on.
 *
 * Google's messages are written for developers ("Insufficient Permission"),
 * and a member of staff seeing one on an upload screen learns nothing. The
 * common ones are translated; the rest pass through so a genuinely novel
 * failure is not flattened into "something went wrong".
 */
function readError(status: number, body: string): string {
  if (status === 401) {
    return "Google rejected the stored credentials. Reconnect the Drive account in Settings.";
  }
  if (status === 403 && /storageQuotaExceeded|quotaExceeded/i.test(body)) {
    return "The Google account is out of storage.";
  }
  if (status === 403 && /rateLimitExceeded|userRateLimitExceeded/i.test(body)) {
    return "Google is rate-limiting this account. Wait a minute and try again.";
  }
  if (status === 403) {
    return "Google refused the request. The connected account may not have access to that folder.";
  }
  if (status === 404) {
    return "That file or folder no longer exists in Drive.";
  }
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return `Google Drive: ${parsed.error.message}`;
  } catch {
    // Not JSON. Fall through.
  }
  return `Google Drive returned ${status}.`;
}

/**
 * Exchanges a refresh token for an access token.
 *
 * Not cached across requests on purpose. Serverless instances come and go, a
 * cache shared between them would be another place the token could leak, and
 * this call takes about 150 ms against an upload that takes minutes.
 */
export async function getAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<DriveResult<{ accessToken: string; expiresIn: number }>> {
  const doFetch = input.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
  } catch {
    return { ok: false, error: "Could not reach Google. Check the connection and try again." };
  }

  const body = await response.text();
  if (!response.ok) {
    // A revoked or expired refresh token is the one failure staff must be told
    // about plainly, because the fix is to reconnect and nothing else works.
    if (/invalid_grant/i.test(body)) {
      return {
        ok: false,
        status: response.status,
        error:
          "Google has revoked this connection. It happens if the password changed, access was withdrawn, or it went unused for six months. Reconnect in Settings.",
      };
    }
    return { ok: false, status: response.status, error: readError(response.status, body) };
  }

  try {
    const parsed = JSON.parse(body) as { access_token?: string; expires_in?: number };
    if (!parsed.access_token) {
      return { ok: false, error: "Google returned no access token." };
    }
    return { ok: true, accessToken: parsed.access_token, expiresIn: parsed.expires_in ?? 3600 };
  } catch {
    return { ok: false, error: "Google returned a response this application could not read." };
  }
}

/** Exchanges the one-time authorization code for a refresh token. */
export async function exchangeCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<DriveResult<{ refreshToken: string; accessToken: string; scope: string }>> {
  const doFetch = input.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
  } catch {
    return { ok: false, error: "Could not reach Google." };
  }

  const body = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, error: readError(response.status, body) };
  }

  try {
    const parsed = JSON.parse(body) as {
      refresh_token?: string;
      access_token?: string;
      scope?: string;
    };
    if (!parsed.refresh_token) {
      // Google only issues a refresh token on the FIRST consent unless
      // `prompt=consent` forces a new one. Without it the connection would
      // work until the access token expired an hour later and then break.
      return {
        ok: false,
        error:
          "Google did not return a long-lived token. Remove this app at myaccount.google.com/permissions and connect again.",
      };
    }
    return {
      ok: true,
      refreshToken: parsed.refresh_token,
      accessToken: parsed.access_token ?? "",
      scope: parsed.scope ?? "",
    };
  } catch {
    return { ok: false, error: "Google returned a response this application could not read." };
  }
}

/** Which account authorised, for the settings screen to name it. */
export async function getAccountEmail(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const response = await doFetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${input.accessToken}` },
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as { email?: string };
    return parsed.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Creates a folder, or returns the existing one with that name.
 *
 * Idempotent because a second "TDR Job Files" folder appearing after a
 * reconnect would silently split the firm's files in two.
 */
export async function ensureFolder(input: {
  accessToken: string;
  name: string;
  parentId?: string | null;
  driveId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<DriveResult<{ folderId: string; created: boolean }>> {
  const doFetch = input.fetchImpl ?? fetch;

  const clauses = [
    `name = '${input.name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ];
  if (input.parentId) clauses.push(`'${input.parentId}' in parents`);

  const params = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "files(id,name)",
    pageSize: "1",
    // Required for folders inside a Shared Drive to be visible at all.
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (input.driveId) {
    params.set("driveId", input.driveId);
    params.set("corpora", "drive");
  }

  try {
    const search = await doFetch(`${DRIVE_API}/files?${params.toString()}`, {
      headers: { authorization: `Bearer ${input.accessToken}` },
    });
    if (search.ok) {
      const parsed = (await search.json()) as { files?: Array<{ id: string }> };
      const existing = parsed.files?.[0]?.id;
      if (existing) return { ok: true, folderId: existing, created: false };
    }

    const create = await doFetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        mimeType: "application/vnd.google-apps.folder",
        ...(input.parentId ? { parents: [input.parentId] } : {}),
      }),
    });

    const body = await create.text();
    if (!create.ok) {
      return { ok: false, status: create.status, error: readError(create.status, body) };
    }
    const parsed = JSON.parse(body) as { id?: string };
    if (!parsed.id) return { ok: false, error: "Google created no folder." };
    return { ok: true, folderId: parsed.id, created: true };
  } catch {
    return { ok: false, error: "Could not reach Google Drive." };
  }
}

/**
 * Opens a resumable upload session and returns the URL to PUT to.
 *
 * This is what makes Drive workable at all for large files. The session URL
 * carries its own authorisation, so the browser can send the bytes directly
 * and the 4.5 MB serverless request limit never applies.
 */
export async function createResumableUpload(input: {
  accessToken: string;
  filename: string;
  mimeType: string;
  folderId: string;
  size: number;
  fetchImpl?: typeof fetch;
}): Promise<DriveResult<{ uploadUrl: string }>> {
  const doFetch = input.fetchImpl ?? fetch;

  try {
    const response = await doFetch(
      `${DRIVE_UPLOAD}?uploadType=resumable&supportsAllDrives=true&fields=id`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          "content-type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": input.mimeType || "application/octet-stream",
          "X-Upload-Content-Length": String(input.size),
        },
        body: JSON.stringify({
          name: input.filename,
          parents: [input.folderId],
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, status: response.status, error: readError(response.status, body) };
    }

    // The session URL comes back in a header, not the body.
    const uploadUrl = response.headers.get("location");
    if (!uploadUrl) {
      return { ok: false, error: "Google did not return an upload location." };
    }
    return { ok: true, uploadUrl };
  } catch {
    return { ok: false, error: "Could not reach Google Drive." };
  }
}

export type DriveFile = {
  id: string;
  name: string;
  size: number | null;
  mimeType: string | null;
  webViewLink: string | null;
};

/** Confirms an upload landed, and reads back what Google recorded. */
export async function getFile(input: {
  accessToken: string;
  fileId: string;
  fetchImpl?: typeof fetch;
}): Promise<DriveResult<{ file: DriveFile }>> {
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const response = await doFetch(
      `${DRIVE_API}/files/${encodeURIComponent(input.fileId)}?fields=id,name,size,mimeType,webViewLink,trashed&supportsAllDrives=true`,
      { headers: { authorization: `Bearer ${input.accessToken}` } },
    );

    const body = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, error: readError(response.status, body) };
    }

    const parsed = JSON.parse(body) as {
      id?: string;
      name?: string;
      size?: string;
      mimeType?: string;
      webViewLink?: string;
      trashed?: boolean;
    };
    if (!parsed.id) return { ok: false, error: "That file does not exist in Drive." };
    if (parsed.trashed) {
      // Trashed rather than deleted is worth distinguishing: it is recoverable
      // from Drive's bin, and telling somebody it is "gone" would be wrong.
      return { ok: false, error: "That file is in the Drive bin. Restore it in Drive." };
    }

    return {
      ok: true,
      file: {
        id: parsed.id,
        name: parsed.name ?? "",
        size: parsed.size ? Number(parsed.size) : null,
        mimeType: parsed.mimeType ?? null,
        webViewLink: parsed.webViewLink ?? null,
      },
    };
  } catch {
    return { ok: false, error: "Could not reach Google Drive." };
  }
}

/**
 * The bytes, as a stream.
 *
 * Returns the raw `Response` so the caller can pipe it straight through
 * without buffering — a 200 MB drawing must not be held in a serverless
 * function's memory on its way to a client.
 */
export async function downloadFile(input: {
  accessToken: string;
  fileId: string;
  fetchImpl?: typeof fetch;
}): Promise<DriveResult<{ response: Response }>> {
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const response = await doFetch(
      `${DRIVE_API}/files/${encodeURIComponent(input.fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { authorization: `Bearer ${input.accessToken}` } },
    );
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, status: response.status, error: readError(response.status, body) };
    }
    return { ok: true, response };
  } catch {
    return { ok: false, error: "Could not reach Google Drive." };
  }
}

/** Moves a file to the Drive bin. Not a hard delete — recoverable for 30 days. */
export async function trashFile(input: {
  accessToken: string;
  fileId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | DriveError> {
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const response = await doFetch(
      `${DRIVE_API}/files/${encodeURIComponent(input.fileId)}?supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ trashed: true }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, status: response.status, error: readError(response.status, body) };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach Google Drive." };
  }
}

/**
 * Where Google sends the owner back to.
 *
 * Derived from the request's own origin rather than configured, so the preview
 * deployment and production each get their own correct value without a second
 * environment variable to keep in step. Both must be listed in the Google Cloud
 * console; `docs/GOOGLE-DRIVE.md` says so, because Google matches this string
 * character for character and a mismatch is the single most common way this
 * flow fails.
 *
 * It lives here rather than beside the route that uses it because a Next.js
 * route file may export only route handlers and Next's own config fields — an
 * extra export fails the build, and `tsc` does not know the rule.
 */
export function driveRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/storage/google/callback`;
}

/** The consent screen URL. `state` is the CSRF guard the callback checks. */
export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: OAUTH_SCOPES,
    // Both are required to get a refresh token at all: `offline` asks for one,
    // and `consent` forces Google to re-issue it rather than assuming the
    // previous grant still covers this. Without them the connection works for
    // one hour and then silently stops.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
