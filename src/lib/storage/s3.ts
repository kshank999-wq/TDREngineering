import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * Presigned URLs for S3-compatible object storage.
 *
 * WHY THIS IS NOT THE AWS SDK
 *
 * All this needs is a presigned PUT and a presigned GET. That is one canonical
 * string and four HMACs — about a hundred lines — against roughly fifteen
 * packages for the SDK, in a dependency tree that is currently Next, React and
 * Supabase and nothing else.
 *
 * The risk of hand-rolling is normally "you get the crypto subtly wrong and it
 * fails silently". That does not apply here: a wrong signature produces a URL
 * the provider rejects outright, which is a loud failure, and the algorithm has
 * published test vectors. `npm run check:storage` verifies this implementation
 * against AWS's own documented example — if the signature does not match
 * theirs to the character, the build fails.
 *
 * WHY S3-COMPATIBLE RATHER THAN A SPECIFIC PROVIDER
 *
 * Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces and AWS S3 all
 * speak this protocol. Writing to the protocol rather than to one vendor is
 * what keeps TDR's files portable — the same reason `files.storage_provider`
 * is a column rather than an assumption.
 */

export type S3Config = {
  endpoint: string; // https://<account>.r2.cloudflarestorage.com
  region: string; // "auto" for R2
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";

/** The body is not known when a URL is minted — that is the whole point. */
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

/**
 * RFC 3986 percent-encoding.
 *
 * `encodeURIComponent` leaves `!'()*` alone, and AWS requires them encoded.
 * A filename containing an apostrophe — "O'Brien survey.pdf" is not exotic —
 * would otherwise produce a signature that does not match the request.
 */
function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-_.~]/.test(ch)) {
      out += ch;
    } else if (ch === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      for (const byte of Buffer.from(ch, "utf8")) {
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

/** AWS4 signing key: four chained HMACs, each keyed by the previous result. */
export function signingKey(
  secret: string,
  date: string,
  region: string,
  service: string,
): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), "aws4_request");
}

/** `20130524T000000Z` and `20130524`. */
function stamps(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * A presigned URL for one object.
 *
 * `UNSIGNED-PAYLOAD` is correct and required for presigned URLs: the body is
 * not known when the URL is minted, which is the entire point — the browser
 * uploads straight to the provider without the bytes passing through Vercel.
 */
export function presignUrl(input: {
  config: S3Config;
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  key: string;
  expiresIn: number;
  /** Extra query parameters, e.g. response-content-disposition for downloads. */
  query?: Record<string, string>;
  now?: Date;
}): string {
  const { config, method, key, expiresIn } = input;
  const { amzDate, dateStamp } = stamps(input.now ?? new Date());

  const url = new URL(config.endpoint);
  const host = url.host;

  // Path-style addressing (/<bucket>/<key>). R2 and B2 both accept it, and it
  // avoids the DNS and TLS problems that bucket names with dots cause in
  // virtual-hosted style. An empty bucket means a virtual-hosted endpoint,
  // where the bucket is already in the hostname — without that branch the path
  // becomes "//key" and the signature silently stops matching.
  const canonicalUri =
    (config.bucket ? "/" + uriEncode(config.bucket, false) : "") +
    "/" + uriEncode(key, false);

  const credentialScope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;

  const params: Record<string, string> = {
    "X-Amz-Algorithm": ALGORITHM,
    // Required, and easy to miss: it appears BOTH as the payload-hash line of
    // the canonical request AND as a query parameter. Omitting the query
    // parameter produces a signature that looks perfectly well-formed and is
    // rejected by every provider. Verified against AWS's own s3-request-
    // presigner, which was the only way to find it.
    "X-Amz-Content-Sha256": UNSIGNED_PAYLOAD,
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
    ...(input.query ?? {}),
  };

  // Sorted by encoded key, each value encoded. Order is part of the signature.
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "host",
    UNSIGNED_PAYLOAD,
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(config.secretAccessKey, dateStamp, config.region, SERVICE),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return `${url.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
