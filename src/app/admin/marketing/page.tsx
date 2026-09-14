import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { marketingCategories, marketingCategoryLabel } from "@/content/marketing";
import { formatBytes } from "@/lib/uploads";
import { createMarketingAsset } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The marketing library.
 *
 * Sorted so the two things worth acting on surface first: assets with nothing
 * uploaded, and assets nobody has ever downloaded.
 */
export default async function MarketingLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; show?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff) notFound();

  const { q, category, show } = await searchParams;
  const supabase = await supabaseServer();

  let query = supabase
    .from("v_marketing_library")
    .select(
      "id, title, description, category, tags, slug, is_public, download_count, last_downloaded_at, current_version, version_count, original_filename, byte_size, needs_upload, archived_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(300);

  if (show === "archived") query = query.not("archived_at", "is", null);
  else query = query.is("archived_at", null);

  if (category) query = query.eq("category", category);
  if (q) query = query.ilike("search_text", `%${q}%`);

  const { data: rows } = await query;
  const assets = rows ?? [];
  const shared = assets.filter((a) => a.is_public).length;
  const incomplete = assets.filter((a) => a.needs_upload).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Marketing library</h1>
          <p className="mt-1 text-sm text-ink-600">
            Flyers, brochures, rate sheets. Each one keeps its history, so a share link always
            serves the current version.
          </p>
        </div>
        <p className="text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{assets.length}</span> items ·{" "}
          <span className="font-semibold text-ink-900">{shared}</span> shared
          {incomplete > 0 ? (
            <>
              {" "}
              · <span className="font-semibold text-amber-700">{incomplete}</span> awaiting a file
            </>
          ) : null}
        </p>
      </header>

      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Title, description, tag, filename"
          className="min-w-64 flex-1 rounded-md border border-ink-300 px-3 py-2 text-sm"
        />
        <select
          name="category"
          defaultValue={category ?? ""}
          className="rounded-md border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {marketingCategories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          name="show"
          defaultValue={show ?? ""}
          className="rounded-md border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="">Current</option>
          <option value="archived">Archived</option>
        </select>
        <button className="rounded-md border border-ink-300 px-4 py-2 text-sm font-medium">
          Filter
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((a) => (
          <Link
            key={a.id as string}
            href={`/admin/marketing/${a.id}`}
            className="flex flex-col rounded-lg border border-ink-200 bg-white p-4 hover:border-ink-400"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-ink-900">{a.title as string}</h2>
              {a.is_public ? (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                  Shared
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {marketingCategoryLabel(a.category as string)}
              {a.current_version ? ` · v${a.current_version}` : ""}
            </p>

            {a.description ? (
              <p className="mt-2 line-clamp-2 text-sm text-ink-600">{a.description as string}</p>
            ) : null}

            {a.needs_upload ? (
              <p className="mt-3 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                No file uploaded yet
              </p>
            ) : (
              <p className="mt-3 truncate text-xs text-ink-500">
                {a.original_filename as string}
                {a.byte_size ? ` · ${formatBytes(Number(a.byte_size))}` : ""}
              </p>
            )}

            {(a.tags as string[])?.length ? (
              <p className="mt-2 flex flex-wrap gap-1">
                {(a.tags as string[]).slice(0, 4).map((t) => (
                  <span key={t} className="rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-600">
                    {t}
                  </span>
                ))}
              </p>
            ) : null}

            <p className="mt-auto pt-3 text-xs text-ink-400">
              {Number(a.download_count ?? 0)} download
              {Number(a.download_count ?? 0) === 1 ? "" : "s"}
              {Number(a.version_count ?? 0) > 1 ? ` · ${a.version_count} versions` : ""}
            </p>
          </Link>
        ))}

        {assets.length === 0 ? (
          <p className="col-span-full rounded-lg border border-dashed border-ink-300 p-8 text-center text-ink-500">
            Nothing here yet.
          </p>
        ) : null}
      </div>

      <section className="rounded-lg border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">Add an item</h2>
        <p className="mt-1 text-sm text-ink-600">
          Create it first, then upload the file. The web address comes from the title and is
          fixed afterwards, so a link you hand out keeps working when the title changes.
        </p>
        <form action={createMarketingAsset} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">Title</span>
              <input
                name="title"
                required
                placeholder="Boundary survey flyer"
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-ink-800">Category</span>
              <select
                name="category"
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
              >
                {marketingCategories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Description</span>
            <textarea
              name="description"
              rows={2}
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-800">Tags</span>
            <input
              name="tags"
              placeholder="alta, residential, trade show"
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-ink-500">
              Comma separated. Lower-cased so they match when you search.
            </span>
          </label>
          <button className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white">
            Create
          </button>
        </form>
      </section>
    </div>
  );
}
