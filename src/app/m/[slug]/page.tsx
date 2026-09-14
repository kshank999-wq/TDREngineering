import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { marketingCategoryLabel } from "@/content/marketing";
import { formatBytes } from "@/lib/uploads";
import { site, hasPhone } from "@/content/site";

/**
 * The page behind a shared marketing link: /m/<slug>.
 *
 * A page rather than a bare download, so the link previews sensibly when it is
 * pasted into an email or a message, and so somebody who opens it on a phone
 * sees what it is before a file lands in their downloads folder.
 *
 * Same shape as the proposal signing path: the visitor has no database access.
 * They reach this route, which holds the service role and asks
 * `marketing_asset_for_public()` — which decides what is released and chooses
 * the columns.
 */

export const dynamic = "force-dynamic";

// Public means "anyone with the link", not "advertised". Staff will share
// something with one prospect; that should not put it in a search index. Set
// in `generateMetadata` below rather than a static `metadata` export — Next
// allows only one of the two, and both branches there send `noindex`.

type PublicAsset = {
  asset_id: string;
  title: string;
  description: string | null;
  category: string;
  version: number;
  filename: string;
  content_type: string | null;
  byte_size: number | null;
  updated_at: string;
};

async function readAsset(slug: string): Promise<PublicAsset | null> {
  if (!slug || slug.length > 60) return null;
  const { data, error } = await supabaseAdmin().rpc("marketing_asset_for_public", {
    p_slug: slug,
  });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as PublicAsset;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const asset = await readAsset(slug);
  if (!asset) return { title: "Not available", robots: { index: false, follow: false } };
  return {
    title: `${asset.title} — ${site.name}`,
    description: asset.description ?? undefined,
    robots: { index: false, follow: false },
  };
}

export default async function MarketingAssetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const asset = await readAsset(slug);

  if (!asset) {
    // One message for every failure — never shared, sharing switched off,
    // archived, never existed. Which it was is nobody's business.
    return (
      <main className="mx-auto max-w-2xl px-4 py-20">
        <div className="rounded-lg border border-ink-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-bold text-ink-900">This item is no longer available</h1>
          <p className="mt-4 text-ink-600">
            It may have been replaced or withdrawn. Please get in touch and we will send you
            the current version.
          </p>
          <p className="mt-6 text-sm text-ink-500">
            {site.name} ·{" "}
            {hasPhone ? (
              <>
                <a className="underline" href={site.phoneHref}>
                  {site.phone}
                </a>{" "}
                ·{" "}
              </>
            ) : null}
            <a className="underline" href={`mailto:${site.email}`}>
              {site.email}
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink-50 py-10 md:py-16">
      <div className="mx-auto max-w-2xl px-4">
        <div className="rounded-lg border border-ink-200 bg-white p-8">
          <p className="eyebrow">{site.name}</p>
          <h1 className="mt-2 text-2xl font-bold text-ink-900 md:text-3xl">{asset.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{marketingCategoryLabel(asset.category)}</p>

          {asset.description ? (
            <p className="mt-4 whitespace-pre-wrap leading-relaxed text-ink-700">
              {asset.description}
            </p>
          ) : null}

          <a
            href={`/m/${slug}/download`}
            className="mt-6 inline-flex items-center rounded-md bg-ink-900 px-5 py-3 font-semibold text-white hover:bg-ink-800"
          >
            Download
          </a>

          <p className="mt-3 text-xs text-ink-500">
            {asset.filename}
            {asset.byte_size ? ` · ${formatBytes(Number(asset.byte_size))}` : ""}
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-ink-500">
          {hasPhone ? (
            <>
              <a className="underline" href={site.phoneHref}>
                {site.phone}
              </a>{" "}
              ·{" "}
            </>
          ) : null}
          <a className="underline" href={`mailto:${site.email}`}>
            {site.email}
          </a>
        </p>
      </div>
    </main>
  );
}
