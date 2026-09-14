import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { presignUrl, type S3Config } from "@/lib/storage/s3";
import { env } from "@/lib/env";

/**
 * Where a file's bytes actually live, and how to reach them.
 *
 * `files.storage_provider` has been a column since 0001, written that way
 * "precisely so the bytes could move later". This is the module that cashes
 * that in.
 *
 * THE MIGRATION IS PER FILE, NOT A CUTOVER
 *
 * Every download reads the provider from the file's own row. A file uploaded
 * to Supabase last month and a file uploaded to R2 today both work, at the
 * same time, with no migration step in between and no flag day. Switching
 * providers changes where the NEXT upload goes and nothing else.
 *
 * That matters because the alternative — move everything, then switch — means
 * a window where half of TDR's deliverables are unreachable, and no way to
 * back out if the new provider disappoints.
 */

export type StorageProvider = "supabase" | "s3";

/** The provider new uploads go to. Supabase until S3 credentials are set. */
export function activeProvider(): StorageProvider {
  return s3Configured() ? "s3" : "supabase";
}

export function s3Configured(): boolean {
  return Boolean(
    env.s3Endpoint && env.s3Bucket && env.s3AccessKeyId && env.s3SecretAccessKey,
  );
}

function s3Config(): S3Config {
  return {
    endpoint: env.s3Endpoint,
    region: env.s3Region || "auto",
    bucket: env.s3Bucket,
    accessKeyId: env.s3AccessKeyId,
    secretAccessKey: env.s3SecretAccessKey,
  };
}

/**
 * Normalises whatever is on the row. Anything unrecognised is treated as
 * Supabase, which is where every file written before this module lives — a
 * wrong guess there returns a broken link, where defaulting to S3 would try to
 * reach a provider that may not be configured at all.
 */
function resolve(provider: string | null | undefined): StorageProvider {
  return provider === "s3" ? "s3" : "supabase";
}

export type SignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * A short-lived link to read one file.
 *
 * `downloadAs` sets the filename the browser saves it under, so a client gets
 * "ALTA Survey.pdf" rather than the timestamped storage key.
 */
export async function signedDownloadUrl(input: {
  provider: string | null | undefined;
  bucket: string;
  path: string;
  expiresIn: number;
  downloadAs?: string | null;
}): Promise<SignedUrlResult> {
  const provider = resolve(input.provider);

  if (provider === "s3") {
    if (!s3Configured()) {
      // A file recorded as living in S3 while S3 is unconfigured is a
      // deployment problem, and saying so beats a signature failure.
      return {
        ok: false,
        error: "This file is in cloud storage, which is not configured on this deployment.",
      };
    }
    return {
      ok: true,
      url: presignUrl({
        config: { ...s3Config(), bucket: input.bucket || env.s3Bucket },
        method: "GET",
        key: input.path,
        expiresIn: input.expiresIn,
        query: input.downloadAs
          ? {
              "response-content-disposition": `attachment; filename="${input.downloadAs.replace(/"/g, "")}"`,
            }
          : undefined,
      }),
    };
  }

  const { data, error } = await supabaseAdmin()
    .storage.from(input.bucket)
    .createSignedUrl(
      input.path,
      input.expiresIn,
      input.downloadAs ? { download: input.downloadAs } : undefined,
    );

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not open that file." };
  }
  return { ok: true, url: data.signedUrl };
}

export type UploadTarget =
  | {
      ok: true;
      provider: StorageProvider;
      bucket: string;
      path: string;
      /** Where the browser PUTs the bytes. */
      uploadUrl: string;
      /** Supabase's signed-upload token. Absent for S3. */
      token?: string;
      /** Headers the browser must send for the signature to verify. */
      headers: Record<string, string>;
    }
  | { ok: false; error: string };

/**
 * Somewhere for the browser to PUT a file, without the bytes passing through
 * the application. Vercel caps a serverless request body at 4.5 MB and a point
 * cloud is three orders of magnitude past that.
 */
export async function signedUploadTarget(input: {
  bucket: string;
  path: string;
  expiresIn: number;
  contentType?: string | null;
}): Promise<UploadTarget> {
  const provider = activeProvider();

  if (provider === "s3") {
    return {
      ok: true,
      provider: "s3",
      bucket: env.s3Bucket,
      path: input.path,
      uploadUrl: presignUrl({
        config: s3Config(),
        method: "PUT",
        key: input.path,
        expiresIn: input.expiresIn,
      }),
      // Only `host` is signed, so the browser may send whatever content type it
      // likes. Sending one is still worth it: it is stored as the object's
      // content type and decides whether a PDF opens or downloads later.
      headers: input.contentType ? { "content-type": input.contentType } : {},
    };
  }

  const { data, error } = await supabaseAdmin()
    .storage.from(input.bucket)
    .createSignedUploadUrl(input.path);

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not start the upload." };
  }
  return {
    ok: true,
    provider: "supabase",
    bucket: input.bucket,
    path: data.path,
    uploadUrl: data.signedUrl,
    token: data.token,
    headers: input.contentType ? { "content-type": input.contentType } : {},
  };
}

/**
 * Whether the bytes are really there.
 *
 * Checked before a file is recorded, because without it the application will
 * happily record a file nobody can download and the failure surfaces later,
 * when a client clicks the link.
 */
export async function objectExists(input: {
  provider: StorageProvider;
  bucket: string;
  path: string;
}): Promise<boolean> {
  if (input.provider === "s3") {
    if (!s3Configured()) return false;
    try {
      const response = await fetch(
        presignUrl({
          config: { ...s3Config(), bucket: input.bucket || env.s3Bucket },
          method: "HEAD",
          key: input.path,
          expiresIn: 60,
        }),
        { method: "HEAD" },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  const folder = input.path.split("/").slice(0, -1).join("/");
  const name = input.path.split("/").pop() ?? "";
  const { data } = await supabaseAdmin().storage.from(input.bucket).list(folder, { search: name });
  return Boolean(data?.some((entry) => entry.name === name));
}

/** Removing an object. Used when a metadata row is written but the upload failed. */
export async function deleteObject(input: {
  provider: string | null | undefined;
  bucket: string;
  path: string;
}): Promise<void> {
  if (resolve(input.provider) === "s3") {
    if (!s3Configured()) return;
    try {
      await fetch(
        presignUrl({
          config: { ...s3Config(), bucket: input.bucket || env.s3Bucket },
          method: "DELETE",
          key: input.path,
          expiresIn: 60,
        }),
        { method: "DELETE" },
      );
    } catch {
      // Best effort. An orphaned object costs pennies; a failed cleanup must
      // not fail the operation that triggered it.
    }
    return;
  }

  try {
    await supabaseAdmin().storage.from(input.bucket).remove([input.path]);
  } catch {
    // Same reasoning.
  }
}
