import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getStaffUser, supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { keyIsUsable } from "@/lib/storage/secrets";
import { s3Configured } from "@/lib/storage/providers";
import { driveRedirectUri } from "@/lib/storage/google-drive";
import { DisconnectDrive } from "@/components/admin/disconnect-drive";
import { DriveSetupGuide } from "@/components/admin/drive-setup-guide";

/**
 * The redirect URIs to register with Google.
 *
 * Derived from the host actually serving this page, so whoever is reading the
 * setup steps is shown the URI for the deployment they are on rather than one
 * written down months ago. The eventual production domain is added alongside it
 * when the site is not yet being served from there, because registering both
 * now is what stops the connection breaking on the day DNS moves.
 */
async function redirectUrisToRegister(): Promise<string[]> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const current = host ? driveRedirectUri(`${proto}://${host}`) : "";
  const eventual = driveRedirectUri("https://www.tdrengineering.com");

  const uris = [current, eventual].filter(Boolean);
  return Array.from(new Set(uris));
}

export const dynamic = "force-dynamic";

/**
 * Where job files go, and which Google account they go to.
 *
 * Owners and managers only: connecting storage binds the firm's files to one
 * Google account, which is not an ordinary staff action.
 */

const MESSAGES: Record<string, string> = {
  forbidden: "Only an owner or manager can connect storage.",
  unconfigured:
    "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set on this deployment. The setup steps are below.",
  nokey:
    "STORAGE_TOKEN_KEY is not set. It encrypts the Google credentials before they are stored, and connecting without it is refused.",
  denied: "The Google sign-in was cancelled. Nothing changed.",
  state:
    "That sign-in could not be verified and was rejected. Start again from this page rather than from a link.",
  exchange: "Google would not complete the connection.",
  folder: "Connected, but the Drive folder could not be created.",
  save: "Google accepted the connection but it could not be saved.",
};

export default async function StorageSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string; connected?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff || (staff.role !== "owner" && staff.role !== "manager")) notFound();

  const { error, detail, connected } = await searchParams;
  const supabase = await supabaseServer();

  const { data: connection } = await supabase
    .from("v_storage_connections")
    .select(
      "id, account_email, folder_name, folder_id, connected_at, last_used_at, last_error, last_error_at, has_token, connected_by_name",
    )
    .eq("provider", "google_drive")
    .eq("is_active", true)
    .maybeSingle();

  const { count: driveFiles } = await supabase
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("storage_provider", "google_drive");

  const configured = Boolean(env.googleClientId && env.googleClientSecret);
  const keyReady = keyIsUsable(env.storageTokenKey);
  const live = Boolean(connection?.has_token);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">File storage</h1>
        <p className="mt-1 text-sm text-ink-600">
          Where job files are kept. Changing this affects new uploads only — files already
          stored keep working exactly where they are.
        </p>
      </header>

      {connected ? (
        <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Google Drive connected. New job file uploads will go there.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">{MESSAGES[error] ?? "Something went wrong."}</p>
          {detail ? <p className="mt-1">{detail}</p> : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------ Google Drive */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Google Drive</h2>
            <p className="mt-1 text-sm text-ink-600">
              Job files land in a folder in TDR&rsquo;s own Drive, where staff can open them
              the usual way.
            </p>
          </div>
          {live ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">
              Connected
            </span>
          ) : null}
        </div>

        {connection?.last_error ? (
          <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">This connection is not working.</p>
            <p className="mt-1">{connection.last_error as string}</p>
            {connection.last_error_at ? (
              <p className="mt-1 text-xs">
                Last failed {new Date(connection.last_error_at as string).toLocaleString()}
              </p>
            ) : null}
          </div>
        ) : null}

        {live ? (
          <>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-500">Account</dt>
                <dd className="font-medium text-ink-900">
                  {(connection?.account_email as string) ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Folder</dt>
                <dd className="font-medium text-ink-900">
                  {(connection?.folder_name as string) ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Connected</dt>
                <dd className="text-ink-900">
                  {connection?.connected_at
                    ? new Date(connection.connected_at as string).toLocaleDateString()
                    : "—"}
                  {connection?.connected_by_name
                    ? ` by ${connection.connected_by_name as string}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Files stored here</dt>
                <dd className="text-ink-900">{driveFiles ?? 0}</dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-3">
              {connection?.folder_id ? (
                <a
                  href={`https://drive.google.com/drive/folders/${connection.folder_id}`}
                  target="_blank"
                  rel="noopener"
                  className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800"
                >
                  Open the folder in Drive
                </a>
              ) : null}
              <a
                href="/api/storage/google/start"
                className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800"
              >
                Reconnect
              </a>
              <DisconnectDrive fileCount={driveFiles ?? 0} />
            </div>
          </>
        ) : (
          <div className="mt-4">
            {!configured || !keyReady ? (
              <DriveSetupGuide
                redirectUris={await redirectUrisToRegister()}
                needsGoogleCredentials={!configured}
                needsKey={!keyReady}
              />
            ) : (
              <a
                href="/api/storage/google/start"
                className="inline-flex rounded-md bg-ink-900 px-5 py-3 font-semibold text-white"
              >
                Connect Google Drive
              </a>
            )}
          </div>
        )}
      </section>

      {/* ----------------------------------------------------- where uploads go */}
      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">Where new uploads go</h2>
        <p className="mt-1 text-sm text-ink-600">
          Whichever is highest in this list. Files already stored anywhere else keep working
          — every file records where its own bytes live.
        </p>
        <ol className="mt-4 space-y-2 text-sm">
          <Option
            label="Google Drive"
            active={live}
            detail={live ? "Connected above." : "Not connected."}
            current={live}
          />
          <Option
            label="Cloud object storage (Cloudflare R2 or similar)"
            active={s3Configured()}
            detail={
              s3Configured()
                ? "Configured in Vercel."
                : "Not set up. An alternative to Drive for very large deliverables — ask and it can be switched on."
            }
            current={!live && s3Configured()}
          />
          <Option
            label="Supabase Storage"
            active
            detail="Always available. Used when nothing else is configured."
            current={!live && !s3Configured()}
          />
        </ol>
      </section>

      <p className="text-sm text-ink-500">
        <Link href="/admin/jobs" className="underline">
          Back to jobs
        </Link>
      </p>
    </div>
  );
}

function Option({
  label,
  active,
  detail,
  current,
}: {
  label: string;
  active: boolean;
  detail: string;
  current: boolean;
}) {
  return (
    <li className="flex gap-3 rounded-md border border-ink-100 p-3">
      <span
        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
          current ? "bg-emerald-500" : active ? "bg-ink-300" : "bg-ink-200"
        }`}
      />
      <span>
        <span className={`font-medium ${current ? "text-ink-900" : "text-ink-600"}`}>
          {label}
        </span>
        {current ? (
          <span className="ml-2 text-xs text-emerald-700">in use</span>
        ) : null}
        <span className="block text-xs text-ink-500">{detail}</span>
      </span>
    </li>
  );
}
