/**
 * Contract checks for connected Google Drive storage.
 *
 * Two things are covered, both of which fail quietly when broken:
 *
 *   ENCRYPTION — the refresh token is the most dangerous value in the
 *   database: it does not expire and grants continuing access to TDR's Drive.
 *   If encryption silently degraded to something reversible, or stopped
 *   detecting tampering, nothing would look wrong.
 *
 *   THE DRIVE CLIENT — every call is against a stubbed fetch, so this runs in
 *   CI with no network, no credentials and no Google account. What it checks
 *   is that failures come back as sentences rather than throwing: an expired
 *   token must produce "reconnect in Settings" on the upload screen, not a
 *   500 on a job record.
 */

import {
  encryptSecret,
  decryptSecret,
  keyIsUsable,
  maskSecret,
  MissingKeyError,
} from "../src/lib/storage/secrets";
import {
  getAccessToken,
  exchangeCode,
  createResumableUpload,
  getFile,
  downloadFile,
  ensureFolder,
  authorizeUrl,
  OAUTH_SCOPES,
  DRIVE_SCOPE,
} from "../src/lib/storage/google-drive";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  →  ${detail}` : ""}`);
  }
}

/** A fetch that never touches the network. */
function stub(
  handler: (url: string, init?: RequestInit) => { status: number; body: string; headers?: Record<string, string> },
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status, body, headers } = handler(url, init);
    return new Response(body, { status, headers: headers ?? {} });
  }) as typeof fetch;
}

console.log("\nconnected storage contract checks\n");

// ============================================================ encryption ===
const KEY = "a".repeat(32);
const TOKEN = "1//0eXAMPLEreFRe5hT0k3n-not-a-real-one_abcdef";

const sealed = encryptSecret(TOKEN, KEY);

check("ciphertext carries a version prefix", sealed.startsWith("v1."), sealed.slice(0, 12));
check("ciphertext has four parts", sealed.split(".").length === 4);
check("it round-trips", decryptSecret(sealed, KEY) === TOKEN);

// The whole point: a database copy must be useless on its own.
check("the plaintext is not in the ciphertext", !sealed.includes(TOKEN));
check(
  "no recognisable fragment survives",
  !sealed.includes("EXAMPLEreFRe5hT0k3n") && !sealed.includes("abcdef"),
);

// Encrypting twice must differ, or identical tokens would be linkable and the
// IV would be being reused — the one mistake GCM does not forgive.
const sealedAgain = encryptSecret(TOKEN, KEY);
check("the same value encrypts differently each time", sealed !== sealedAgain);
check("both still decrypt", decryptSecret(sealedAgain, KEY) === TOKEN);

const ivs = new Set(
  Array.from({ length: 50 }, () => encryptSecret(TOKEN, KEY).split(".")[1]),
);
check("fifty encryptions use fifty distinct IVs", ivs.size === 50, String(ivs.size));

// Wrong key, and every shape of tampering.
check("a different key does not decrypt", decryptSecret(sealed, "b".repeat(32)) === null);

const parts = sealed.split(".");
const flip = (s: string) => {
  const chars = [...s];
  chars[chars.length - 2] = chars[chars.length - 2] === "A" ? "B" : "A";
  return chars.join("");
};

check(
  "a tampered ciphertext is rejected",
  decryptSecret([parts[0], parts[1], parts[2], flip(parts[3])].join("."), KEY) === null,
);
check(
  "a tampered authentication tag is rejected",
  decryptSecret([parts[0], parts[1], flip(parts[2]), parts[3]].join("."), KEY) === null,
);
check(
  "a tampered IV is rejected",
  decryptSecret([parts[0], flip(parts[1]), parts[2], parts[3]].join("."), KEY) === null,
);
check(
  "an unknown version is rejected",
  decryptSecret(["v2", parts[1], parts[2], parts[3]].join("."), KEY) === null,
);
check("a truncated value is rejected", decryptSecret(parts.slice(0, 3).join("."), KEY) === null);
check("an empty value is rejected", decryptSecret("", KEY) === null);
check("garbage is rejected", decryptSecret("not-even-close", KEY) === null);

// A short key would silently weaken everything, so it is refused outright.
check("a short key is not usable", !keyIsUsable("tooshort"));
check("an empty key is not usable", !keyIsUsable(""));
check("an absent key is not usable", !keyIsUsable(undefined));
check("a 32-character key is usable", keyIsUsable(KEY));

let threw = false;
try {
  encryptSecret(TOKEN, "short");
} catch (error) {
  threw = error instanceof MissingKeyError;
}
check("encrypting with a short key throws, rather than storing plaintext", threw);
check("decrypting with a short key returns null", decryptSecret(sealed, "short") === null);

// Unicode and length, because a token format can change.
const unicode = "réfrèsh-tökèn-🔑-ünïcode";
check("unicode round-trips", decryptSecret(encryptSecret(unicode, KEY), KEY) === unicode);
const long = "x".repeat(5000);
check("a long value round-trips", decryptSecret(encryptSecret(long, KEY), KEY) === long);

check("masking hides the middle", maskSecret("abcdefghijklmnop").startsWith("abcd"));
check("masking hides most of it", !maskSecret("abcdefghijklmnop").includes("efghijkl"));

// =============================================================== scopes ====
// The narrow scope is a security decision, not a detail: `drive.file` limits a
// credential compromise to files this application created.
check("the scope is drive.file, not full Drive", DRIVE_SCOPE.endsWith("/auth/drive.file"));
check("full-Drive scope is not requested", !OAUTH_SCOPES.includes("auth/drive "));
check(
  "no read-everything scope is requested",
  !OAUTH_SCOPES.includes("drive.readonly") && !OAUTH_SCOPES.includes("drive.metadata"),
);

const consent = new URL(authorizeUrl({
  clientId: "client-123.apps.googleusercontent.com",
  redirectUri: "https://www.tdrengineering.com/api/storage/google/callback",
  state: "state-token",
}));
check("consent asks for offline access", consent.searchParams.get("access_type") === "offline");
check("consent forces a fresh grant", consent.searchParams.get("prompt") === "consent");
check("consent carries the state token", consent.searchParams.get("state") === "state-token");
check("consent requests the narrow scope", consent.searchParams.get("scope") === OAUTH_SCOPES);

async function main() {
  // =========================================================== drive client ==
  const OK_TOKEN = { status: 200, body: JSON.stringify({ access_token: "ya29.test", expires_in: 3599 }) };

  const tokenOk = await getAccessToken({
    clientId: "id", clientSecret: "secret", refreshToken: "refresh",
    fetchImpl: stub(() => OK_TOKEN),
  });
  check("a token refresh succeeds", tokenOk.ok && tokenOk.accessToken === "ya29.test");

  // The failure that actually happens in production, months later.
  const revoked = await getAccessToken({
    clientId: "id", clientSecret: "secret", refreshToken: "refresh",
    fetchImpl: stub(() => ({ status: 400, body: JSON.stringify({ error: "invalid_grant" }) })),
  });
  check("a revoked connection is explained, not thrown", !revoked.ok);
  check(
    "a revoked connection says to reconnect",
    !revoked.ok && /reconnect/i.test(revoked.error),
    !revoked.ok ? revoked.error : "",
  );
  check(
    "a revoked connection explains why it happened",
    !revoked.ok && /six months|password|withdrawn/i.test(revoked.error),
  );

  // Network failure must not throw either — a carrier outage becoming a 500 on
  // a job record is the pattern check:shipping exists to prevent.
  const offline = await getAccessToken({
    clientId: "id", clientSecret: "secret", refreshToken: "refresh",
    fetchImpl: (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch,
  });
  check("an unreachable Google returns a message", !offline.ok);
  check("it does not leak the underlying error", !offline.ok && !offline.error.includes("ECONNREFUSED"));

  // Missing refresh token on first consent — the trap that makes a connection
  // work for exactly one hour.
  const noRefresh = await exchangeCode({
    code: "c", clientId: "id", clientSecret: "secret", redirectUri: "https://x/cb",
    fetchImpl: stub(() => ({ status: 200, body: JSON.stringify({ access_token: "a" }) })),
  });
  check("a missing refresh token is caught at connect time", !noRefresh.ok);
  check(
    "it says how to fix it",
    !noRefresh.ok && /permissions|connect again/i.test(noRefresh.error),
    !noRefresh.ok ? noRefresh.error : "",
  );

  const exchanged = await exchangeCode({
    code: "c", clientId: "id", clientSecret: "secret", redirectUri: "https://x/cb",
    fetchImpl: stub(() => ({
      status: 200,
      body: JSON.stringify({ refresh_token: "1//refresh", access_token: "ya29", scope: OAUTH_SCOPES }),
    })),
  });
  check("a good exchange returns the refresh token", exchanged.ok && exchanged.refreshToken === "1//refresh");

  // Resumable upload: the session URL arrives in a HEADER, and missing it would
  // break every upload.
  const upload = await createResumableUpload({
    accessToken: "ya29", filename: "survey.dwg", mimeType: "image/vnd.dwg",
    folderId: "folder1", size: 5_000_000_000,
    fetchImpl: stub(() => ({
      status: 200, body: "",
      headers: { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=xyz" },
    })),
  });
  check("a resumable session returns the upload URL", upload.ok && upload.uploadUrl.includes("upload_id=xyz"));

  const noLocation = await createResumableUpload({
    accessToken: "ya29", filename: "survey.dwg", mimeType: "x", folderId: "f", size: 1,
    fetchImpl: stub(() => ({ status: 200, body: "" })),
  });
  check("a session with no location is an error, not a silent success", !noLocation.ok);

  const quota = await createResumableUpload({
    accessToken: "ya29", filename: "big.las", mimeType: "x", folderId: "f", size: 1,
    fetchImpl: stub(() => ({
      status: 403,
      body: JSON.stringify({ error: { errors: [{ reason: "storageQuotaExceeded" }] } }),
    })),
  });
  check("a full Drive says the account is out of storage", !quota.ok && /out of storage/i.test(quota.error));

  const rateLimited = await createResumableUpload({
    accessToken: "ya29", filename: "a", mimeType: "x", folderId: "f", size: 1,
    fetchImpl: stub(() => ({
      status: 403,
      body: JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }),
    })),
  });
  check("rate limiting says to wait", !rateLimited.ok && /rate-limit/i.test(rateLimited.error));

  // A trashed file is recoverable and must not be reported as gone.
  const trashed = await getFile({
    accessToken: "ya29", fileId: "f1",
    fetchImpl: stub(() => ({ status: 200, body: JSON.stringify({ id: "f1", trashed: true }) })),
  });
  check("a trashed file is distinguished from a missing one", !trashed.ok && /bin/i.test(trashed.error));

  const missing = await getFile({
    accessToken: "ya29", fileId: "gone",
    fetchImpl: stub(() => ({ status: 404, body: "{}" })),
  });
  check("a missing file says so", !missing.ok && /no longer exists/i.test(missing.error));

  const good = await getFile({
    accessToken: "ya29", fileId: "f1",
    fetchImpl: stub(() => ({
      status: 200,
      body: JSON.stringify({
        id: "f1", name: "survey.dwg", size: "12345",
        mimeType: "image/vnd.dwg", webViewLink: "https://drive.google.com/file/d/f1/view",
      }),
    })),
  });
  check("a real file reads back its size as a number", good.ok && good.file.size === 12345);
  check("a real file carries its Drive link", good.ok && Boolean(good.file.webViewLink));

  // The download is streamed, so what comes back must be the Response itself and
  // not a buffered body.
  const streamed = await downloadFile({
    accessToken: "ya29", fileId: "f1",
    fetchImpl: stub(() => ({ status: 200, body: "bytes" })),
  });
  check("a download returns the response for streaming", streamed.ok && streamed.response instanceof Response);

  const expiredDownload = await downloadFile({
    accessToken: "stale", fileId: "f1",
    fetchImpl: stub(() => ({ status: 401, body: "{}" })),
  });
  check(
    "an expired token on download says to reconnect",
    !expiredDownload.ok && /reconnect/i.test(expiredDownload.error),
  );

  // Folder creation must not make a second folder when one exists, or the firm's
  // files quietly split in two.
  let createCalls = 0;
  const existing = await ensureFolder({
    accessToken: "ya29", name: "TDR Job Files",
    fetchImpl: stub((url, init) => {
      if (init?.method === "POST") {
        createCalls += 1;
        return { status: 200, body: JSON.stringify({ id: "new" }) };
      }
      return { status: 200, body: JSON.stringify({ files: [{ id: "already-there" }] }) };
    }),
  });
  check("an existing folder is reused", existing.ok && existing.folderId === "already-there");
  check("no second folder is created", createCalls === 0, String(createCalls));

  const created = await ensureFolder({
    accessToken: "ya29", name: "TDR Job Files",
    fetchImpl: stub((url, init) =>
      init?.method === "POST"
        ? { status: 200, body: JSON.stringify({ id: "made-it" }) }
        : { status: 200, body: JSON.stringify({ files: [] }) },
    ),
  });
  check("a missing folder is created", created.ok && created.folderId === "made-it" && created.created);

  // A folder name with an apostrophe would break the Drive query language.
  let sentQuery = "";
  await ensureFolder({
    accessToken: "ya29", name: "O'Brien's Files",
    fetchImpl: stub((url) => {
      if (!url.includes("uploadType")) sentQuery = url;
      return { status: 200, body: JSON.stringify({ files: [{ id: "x" }] }) };
    }),
  });
  check(
    "an apostrophe in a folder name is escaped",
    sentQuery.includes("%5C%27") || sentQuery.includes("\\'"),
    sentQuery.slice(0, 120),
  );

  console.log("");
  if (failures > 0) {
    console.log(`${failures} connected storage check(s) FAILED.\n`);
    process.exit(1);
  }
  console.log("All connected storage checks passed.\n");
}

void main();
