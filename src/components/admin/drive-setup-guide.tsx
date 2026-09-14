"use client";

import { useState } from "react";

/**
 * The Google Cloud setup, on the page where you get stuck.
 *
 * This used to say "see docs/GOOGLE-DRIVE.md", which is useless to somebody
 * reading a website — the person who needs these steps is signed in to the
 * admin, not holding a checkout of the repository. The runbook still exists for
 * whoever maintains this; the screen carries the same steps for whoever uses it.
 *
 * Two things here are worth more than the prose:
 *
 *   The redirect URIs are computed from the deployment actually serving this
 *   page, not typed from memory. Google matches them character for character,
 *   and a wrong one produces `redirect_uri_mismatch` after you have already
 *   done all the other work.
 *
 *   The key is generated in the browser with `crypto.getRandomValues` and never
 *   sent anywhere. It has to be random and at least 32 characters, and asking
 *   somebody to invent one by hand reliably produces neither.
 */

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-ink-200">
      <code className="flex-1 overflow-x-auto whitespace-nowrap bg-white px-3 py-2 text-xs text-ink-800">
        {value}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard access can be refused outright. The value is on screen
            // and selectable, so say so rather than failing silently.
            setCopied(false);
            alert("Copying was blocked. Select the text and copy it manually.");
          }
        }}
        className="shrink-0 border-l border-ink-200 bg-ink-50 px-3 text-xs font-semibold text-ink-700 hover:bg-ink-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-x-3 border-t border-ink-100 py-4">
      <span className="pt-0.5 text-xs font-semibold tabular-nums text-ink-400">
        {String(n).padStart(2, "0")}
      </span>
      <div>
        <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
        <div className="mt-2 space-y-2 text-sm text-ink-600">{children}</div>
      </div>
    </li>
  );
}

export function DriveSetupGuide({
  redirectUris,
  needsGoogleCredentials,
  needsKey,
}: {
  redirectUris: string[];
  needsGoogleCredentials: boolean;
  needsKey: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Not ready to connect yet.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
        {needsGoogleCredentials ? (
          <li>
            <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> are not
            set in Vercel.
          </li>
        ) : null}
        {needsKey ? (
          <li>
            <code>STORAGE_TOKEN_KEY</code> is not set, or is shorter than 32 characters.
            It encrypts the Google credentials before they are stored.
          </li>
        ) : null}
      </ul>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white"
      >
        {open ? "Hide the steps" : "Show me the steps"}
      </button>

      {!open ? null : (
        <div className="mt-4 rounded-md border border-ink-200 bg-white p-4">
          <p className="text-sm text-ink-600">
            About twenty minutes, and it needs a Google account TDR owns — the Workspace
            account for tdrengineering.com if there is one, not a personal login.
          </p>

          <ol className="mt-3">
            <Step n={1} title="Create a Google Cloud project">
              <p>
                At{" "}
                <a
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noopener"
                  className="underline"
                >
                  console.cloud.google.com
                </a>
                , open the project dropdown at the top left and choose{" "}
                <strong>New project</strong>. Name it <code>TDR Engineering Website</code>{" "}
                and create it. There is no charge for any of this.
              </p>
            </Step>

            <Step n={2} title="Turn on the Drive API">
              <p>
                <strong>APIs &amp; Services</strong> → <strong>Library</strong>, search for{" "}
                <code>Google Drive API</code>, and click <strong>Enable</strong>.
              </p>
            </Step>

            <Step n={3} title="Fill in the consent screen">
              <p>
                <strong>APIs &amp; Services</strong> →{" "}
                <strong>OAuth consent screen</strong>. Choose <strong>Internal</strong> if
                it is offered — that means TDR has Google Workspace, and it skips
                Google&rsquo;s review. Otherwise <strong>External</strong>, which works
                fine; add your own address under <strong>Test users</strong> and leave the
                app in <strong>Testing</strong>.
              </p>
              <p>
                App name <code>TDR Engineering</code>. On the <strong>Scopes</strong> step,
                add <code>.../auth/drive.file</code> and <code>email</code>, and nothing
                else. <code>drive.file</code> is the narrow one: it can only ever touch
                files this site created, so the rest of the Drive stays invisible to it.
              </p>
            </Step>

            <Step n={4} title="Create the OAuth client">
              <p>
                <strong>Credentials</strong> → <strong>Create credentials</strong> →{" "}
                <strong>OAuth client ID</strong> → <strong>Web application</strong>. Under{" "}
                <strong>Authorized redirect URIs</strong>, add{" "}
                {redirectUris.length > 1 ? "both of these" : "this"}:
              </p>
              <div className="space-y-2">
                {redirectUris.map((uri) => (
                  <CopyRow key={uri} value={uri} />
                ))}
              </div>
              <p>
                Google matches these character for character — no trailing slash, no{" "}
                <code>http</code>, no missing <code>www</code>. A mismatch here is the
                commonest way this setup fails, and it fails only at the very last step.
                {redirectUris.length > 1
                  ? " The second one is where the site runs after DNS moves; adding it now means the connection survives the cutover."
                  : null}
              </p>
              <p>Google then shows a client ID and a client secret. Keep them on screen.</p>
            </Step>

            <Step n={5} title="Put three values into Vercel">
              <p>
                <a
                  href="https://vercel.com/"
                  target="_blank"
                  rel="noopener"
                  className="underline"
                >
                  vercel.com
                </a>{" "}
                → the TDR project → <strong>Settings</strong> →{" "}
                <strong>Environment Variables</strong>. Add each to both{" "}
                <strong>Production</strong> and <strong>Preview</strong>:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <code>GOOGLE_CLIENT_ID</code> — from step 4
                </li>
                <li>
                  <code>GOOGLE_CLIENT_SECRET</code> — from step 4
                </li>
                <li>
                  <code>STORAGE_TOKEN_KEY</code> — generate one below
                </li>
              </ul>
              <p className="rounded-md bg-red-50 px-3 py-2 text-red-900">
                Paste the client secret straight from Google into Vercel. Not through
                email, not through chat — the same rule as the database and email keys.
              </p>

              <div className="space-y-2">
                {key ? <CopyRow value={key} /> : null}
                <button
                  type="button"
                  onClick={() => {
                    const bytes = new Uint8Array(32);
                    crypto.getRandomValues(bytes);
                    setKey(
                      btoa(String.fromCharCode(...bytes))
                        .replace(/\+/g, "-")
                        .replace(/\//g, "_")
                        .replace(/=+$/, ""),
                    );
                  }}
                  className="rounded-md border border-ink-300 px-3 py-1.5 text-xs font-semibold text-ink-800"
                >
                  {key ? "Generate another" : "Generate a key"}
                </button>
              </div>

              <p>
                That key is generated in your browser and never sent anywhere. It matters
                because Google&rsquo;s credential does not expire: stored as plain text, a
                database leak would become a Drive leak. Losing the key loses no files —
                it means clicking Connect again.
              </p>
            </Step>

            <Step n={6} title="Redeploy, then come back here">
              <p>
                New environment variables only reach the site on the next deploy. In
                Vercel: <strong>Deployments</strong> → the newest → <strong>⋯</strong> →{" "}
                <strong>Redeploy</strong>. Then reload this page and the Connect button
                will be here.
              </p>
              <p>
                If you chose <strong>External</strong> in step 3, Google will warn that the
                app is not verified, behind <strong>Advanced</strong>. That means Google
                has not reviewed it — true, and it is yours, on your own domain. Click
                through.
              </p>
            </Step>
          </ol>

          <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
            Once connected, upload one throwaway file to a test job and check it lands in
            the Drive folder. Every part of this has been tested against a stand-in for
            Google, and none of it against Google.
          </p>
        </div>
      )}
    </div>
  );
}
