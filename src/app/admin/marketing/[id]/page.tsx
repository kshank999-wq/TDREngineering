import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { MarketingAssetPanel } from "@/components/admin/marketing-asset-panel";
import { marketingCategoryLabel } from "@/content/marketing";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function MarketingAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff) notFound();

  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: asset } = await supabase
    .from("marketing_assets")
    .select(
      "id, title, description, category, tags, slug, is_public, archived_at, download_count, last_downloaded_at, current_version_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!asset) notFound();

  const { data: versions } = await supabase
    .from("marketing_asset_versions")
    .select(
      `id, version, notes, created_at,
       file:files!marketing_asset_versions_file_id_fkey ( original_filename, byte_size ),
       uploader:app_users!marketing_asset_versions_uploaded_by_fkey ( full_name, email )`,
    )
    .eq("asset_id", id)
    .order("version", { ascending: false });

  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink-500">
          <Link href="/admin/marketing" className="underline">
            Marketing library
          </Link>{" "}
          / {marketingCategoryLabel(asset.category as string)}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">{asset.title as string}</h1>
      </header>

      <MarketingAssetPanel
        asset={{
          id: asset.id as string,
          title: asset.title as string,
          description: (asset.description as string) ?? null,
          category: asset.category as string,
          tags: (asset.tags as string[]) ?? [],
          slug: asset.slug as string,
          is_public: Boolean(asset.is_public),
          archived_at: (asset.archived_at as string) ?? null,
          download_count: Number(asset.download_count ?? 0),
          last_downloaded_at: (asset.last_downloaded_at as string) ?? null,
          current_version_id: (asset.current_version_id as string) ?? null,
        }}
        versions={(versions ?? []).map((v) => {
          const file = one(v.file) as
            | { original_filename?: string; byte_size?: number }
            | null;
          const uploader = one(v.uploader) as
            | { full_name?: string; email?: string }
            | null;
          return {
            id: v.id as string,
            version: Number(v.version),
            notes: (v.notes as string) ?? null,
            created_at: v.created_at as string,
            original_filename: file?.original_filename ?? "(file missing)",
            byte_size: file?.byte_size ?? null,
            uploaded_by_name: uploader?.full_name ?? uploader?.email ?? null,
          };
        })}
        shareUrl={`${env.siteUrl.replace(/\/$/, "")}/m/${asset.slug as string}`}
      />
    </div>
  );
}
