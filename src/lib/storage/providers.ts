import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { presignUrl, type S3Config } from "@/lib/storage/s3";
import { env } from "@/lib/env";
import { connectedDrive, driveIsConnected } from "@/lib/storage/connection";
import {
  createResumableUpload,
  getFile as getDriveFile,
  downloadFile as downloadDriveFile,
  trashFile as trashDriveFile,
} from "@/lib/storage/google-drive";

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

export type StorageProvider = "supabase" | "s3" | "google_drive";

/**
 * Where new uploads go.
 *
 * A connected Google Drive wins over S3 credentials, because connecting a
 * Drive is a deliberate act somebody performed in the admin, while S3
 * variables may simply have been left set. Neither configured: Supabase, which
 * always works.
 */
export async function activeProvider(): Promise<StorageProvider> {
  if (await driveIsConnected()) return "google_drive";
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
  if (provider === "s3") return "s3";
  if (provider === "google_drive") return "google_drive";
  return "supabase";
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

  if (provider === "google_drive") {
    // Drive has no signed-URL equivalent — every read needs an Authorization
    // header — so there is no URL to hand back. Callers that can stream use
    // `driveDownload` below; callers that cannot get told plainly rather than
    // being given a link that 401s.
    return {
      ok: false,
      error: "DRIVE_STREAM_REQUIRED",
    };
  }

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
  /** Shown in Drive, where a timestamped storage key would be unreadable. */
  filename?: string;
  byteSize?: number;
}): Promise<UploadTarget> {
  const provider = await activeProvider();

  if (provider === "google_drive") {
    const drive = await connectedDrive();
    if (!drive.ok) return { ok: false, error: drive.error };
    if (!drive.connection.folderId) {
      return { ok: false, error: "The connected Drive has no folder set. Reconnect it in Settings." };
    }

    // A RESUMABLE SESSION, not a direct upload. The session URL carries its
    // own authorisation, so the browser sends the bytes straight to Google and
    // Vercel's 4.5 MB request cap never applies.
    const session = await createResumableUpload({
      accessToken: drive.accessToken,
      filename: input.filename || input.path.split("/").pop() || "file",
      mimeType: input.contentType || "application/octet-stream",
      folderId: drive.connection.folderId,
      size: input.byteSize ?? 0,
    });

    if (!session.ok) return { ok: false, error: session.error };

    return {
      ok: true,
      provider: "google_drive",
      bucket: drive.connection.folderId,
      // Filled in after the upload: Drive assigns the id, not us.
      path: "",
      uploadUrl: session.uploadUrl,
      headers: input.contentType ? { "content-type": input.contentType } : {},
    };
  }

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
  if (input.provider === "google_drive") {
    const drive = await connectedDrive();
    if (!drive.ok) return false;
    const file = await getDriveFile({ accessToken: drive.accessToken, fileId: input.path });
    return file.ok;
  }

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
  if (resolve(input.provider) === "google_drive") {
    try {
      const drive = await connectedDrive();
      // Trashed, not destroyed: Drive keeps it for thirty days, which has
      // rescued more survey files than any policy ever written.
      if (drive.ok) await trashDriveFile({ accessToken: drive.accessToken, fileId: input.path });
    } catch {
      // Best effort, as below.
    }
    return;
  }

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

/**
 * The bytes of a Drive file, for streaming through a route.
 *
 * Separate from `signedDownloadUrl` because it cannot return a URL — Drive has
 * no signed links — and because a caller has to make a conscious choice to
 * stream. Staff never take this path: they get Drive's own web view, which is
 * faster and has no size limit.
 */
export async function driveDownload(
  fileId: string,
): Promise<{ ok: true; response: Response } | { ok: false; error: string }> {
  const drive = await connectedDrive();
  if (!drive.ok) return { ok: false, error: drive.error };
  return downloadDriveFile({ accessToken: drive.accessToken, fileId });
}

/** A link staff can open in Drive directly. Null unless the file is in Drive. */
export async function driveWebLink(input: {
  provider: string | null | undefined;
  path: string;
}): Promise<string | null> {
  if (resolve(input.provider) !== "google_drive") return null;
  const drive = await connectedDrive();
  if (!drive.ok) return null;
  const file = await getDriveFile({ accessToken: drive.accessToken, fileId: input.path });
  return file.ok ? file.file.webViewLink : null;
}
