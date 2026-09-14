import type { Metadata } from "next";
import { verifyUnsubscribeToken } from "@/lib/marketing/unsubscribe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { UnsubscribePanel } from "@/components/marketing/unsubscribe-panel";
import { site, hasPhone } from "@/content/site";

/**
 * The page behind an unsubscribe link.
 *
 * Public, reached by anybody holding the link, and it must work first time and
 * every time — an opt-out link that fails is the one thing CAN-SPAM is
 * unambiguous about.
 *
 * ONE CLICK, NO LOGIN, NO QUESTIONS. There is no "are you sure", no survey,
 * and nothing to fill in. Making somebody work for an opt-out is how a
 * complaint becomes a spam report, which is worse for TDR than the
 * unsubscribe.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const email = verifyUnsubscribeToken(token);

  if (!email) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-bold text-ink-900">This link is not valid</h1>
          <p className="mt-4 text-ink-600">
            It may have been broken by your email program. Email us and we will take you off
            our list straight away.
          </p>
          <p className="mt-6 text-sm text-ink-500">
            <a className="underline" href={`mailto:${site.email}?subject=Unsubscribe`}>
              {site.email}
            </a>
            {hasPhone ? (
              <>
                {" · "}
                <a className="underline" href={site.phoneHref}>
                  {site.phone}
                </a>
              </>
            ) : null}
          </p>
        </div>
      </main>
    );
  }

  // Whether they are already off the list, so somebody clicking a second link
  // is told the truth rather than being made to do it again.
  let already = false;
  try {
    const { data } = await supabaseAdmin().rpc("is_email_suppressed", { p_email: email });
    already = data === true;
  } catch {
    // If this fails, show the button. Offering an opt-out that turns out to be
    // unnecessary is harmless; hiding one because a read failed is not.
    already = false;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <div className="rounded-lg border border-ink-200 bg-white p-8">
        <p className="eyebrow">{site.name}</p>
        <UnsubscribePanel token={token} email={email} alreadySuppressed={already} />
        <p className="mt-8 border-t border-ink-100 pt-4 text-sm text-ink-500">
          This only affects marketing email. If you have work in progress with us, we will
          still contact you about it.
        </p>
      </div>
    </main>
  );
}
