"use client";

import Script from "next/script";

/**
 * Cloudflare Turnstile widget (spec §15 bot protection).
 *
 * Uses implicit rendering: the script finds `.cf-turnstile` and injects a
 * hidden `cf-turnstile-response` input into the surrounding form, which the
 * submit handler reads. Renders nothing at all when no site key is configured,
 * so the forms work before the keys exist.
 */
export function Turnstile({ siteKey }: { siteKey: string }) {
  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-theme="light"
        data-action="tdr-form"
      />
    </>
  );
}
