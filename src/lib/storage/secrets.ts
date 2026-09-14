import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Encrypting the Google refresh token at rest.
 *
 * WHY THIS EXISTS AT ALL
 *
 * Every other secret in this system lives in Vercel's environment. This one
 * cannot: it is obtained at runtime, when somebody clicks Connect, and it has
 * to survive until they disconnect. So it lands in the database — and a
 * refresh token does not expire and grants continuing access to TDR's whole
 * Drive.
 *
 * Encrypted, a database copy is useless on its own. A backup on a laptop, a
 * stray export, a compromised read replica: all ciphertext. Reading it needs
 * the database AND the deployment's key, which live in different places and
 * are compromised by different mistakes.
 *
 * AES-256-GCM, because it authenticates as well as encrypts. Without the
 * authentication tag, somebody who could write to the database could flip bits
 * in the ciphertext and steer the decrypted token somewhere of their choosing.
 * GCM makes tampering a decryption failure instead.
 *
 * Kept free of `server-only` so the CI check can import it directly; it is
 * never imported from a client component.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const VERSION = "v1";

/**
 * The key is derived from the environment value by SHA-256 rather than used
 * raw, so any passphrase length works and the result is always the 32 bytes
 * AES-256 requires. It is NOT a password hash and does not need to be: the
 * input is a generated 32-byte secret, not something a person chose.
 */
function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export class MissingKeyError extends Error {
  constructor() {
    super("STORAGE_TOKEN_KEY is not set. Connected storage cannot be used without it.");
    this.name = "MissingKeyError";
  }
}

/** At least 32 characters: short enough to type, long enough to be a secret. */
export function keyIsUsable(secret: string | undefined | null): boolean {
  return typeof secret === "string" && secret.length >= 32;
}

/**
 * Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 *
 * The version prefix is the part that matters later: changing algorithm or key
 * derivation without it means old values decrypt to nonsense instead of
 * failing loudly.
 */
export function encryptSecret(plaintext: string, key: string): string {
  if (!keyIsUsable(key)) throw new MissingKeyError();

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyFrom(key), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Returns null rather than throwing on anything malformed, tampered with, or
 * encrypted under a different key.
 *
 * Null because every caller's correct response is the same — treat the
 * connection as broken and ask somebody to reconnect — and because an
 * exception carrying a decryption failure tends to end up in a log.
 */
export function decryptSecret(payload: string, key: string): string | null {
  if (!keyIsUsable(key) || !payload) return null;

  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");

    if (iv.length !== IV_BYTES || tag.length !== 16) return null;

    const decipher = createDecipheriv(ALGORITHM, keyFrom(key), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, tampered ciphertext, truncated value — all the same answer.
    return null;
  }
}

/**
 * For showing a token-shaped value on screen or in a log without showing the
 * value. Never used on the refresh token itself, which is never displayed.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(Math.min(value.length - 8, 24))}${value.slice(-4)}`;
}
