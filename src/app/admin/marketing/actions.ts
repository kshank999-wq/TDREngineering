"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { slugify, isValidSlug, uniqueSlug } from "@/lib/marketing/slug";
import { normalizeTags, MAX_MARKETING_BYTES } from "@/content/marketing";
import {
  MARKETING_BUCKET,
  MARKETING_DOWNLOAD_TTL_SECONDS,
  marketingAssetPath,
} from "@/lib/marketing/storage";

/**
 * Staff actions for the marketing asset library.
 *
 * Everything writes through the RLS-scoped session client, so the database
 * enforces staff-only access independently of the `getStaffUser()` checks
 * here. Storage is the exception: minting signed URLs needs the service role.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Creating an asset.
 *
 * The slug is derived from the title but fixed forever afterwards, because it
 * is the shareable link. Renaming "Boundary flyer" to "Boundary survey flyer"
 * must not break a link somebody printed on a business card, so the title is
 * editable and the slug is not.
 */
export async function createMarketingAsset(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("A title is required");

  const supabase = await supabaseServer();

  const requested = String(formData.get("slug") ?? "").trim();
  const base = requested || title;

  const slug = await uniqueSlug(base, async (candidate) => {
    // Checks archived assets too — the unique index covers them, and a slug is
    // never reused.
    const { count } = await supabase
      .from("marketing_assets")
      .select("id", { count: "exact", head: true })
      .eq("slug", candidate);
    return (count ?? 0) > 0;
  });

  if (!slug) {
    throw new Error(
      "Could not make a web address from that title. Use a title with letters or numbers in it.",
    );
  }

  const { data, error } = await supabase
    .from("marketing_assets")
    .insert({
      title: title.slice(0, 200),
      slug,
      description: String(formData.get("description") ?? "").trim() || null,
      category: String(formData.get("category") ?? "flyer"),
      tags: normalizeTags(String(formData.get("tags") ?? "")),
      created_by: staff.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/admin/marketing");
  redirect(`/admin/marketing/${data.id}`);
}

export async function updateMarketingAsset(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!id) return { ok: false, error: "Missing asset." };
  if (!title) return { ok: false, error: "A title is required." };

  const supabase = await supabaseServer();
  // Note what is absent: `slug`. It is the shareable link and is set once.
  const { error } = await supabase
    .from("marketing_assets")
    .update({
      title: title.slice(0, 200),
      description: String(formData.get("description") ?? "").trim() || null,
      category: String(formData.get("category") ?? "flyer"),
      tags: normalizeTags(String(formData.get("tags") ?? "")),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/marketing/${id}`);
  revalidatePath("/admin/marketing");
  return { ok: true, message: "Saved." };
}

/**
 * Turning the share link on or off.
 *
 * Revocable because the bucket is private and the public route mints a
 * short-lived signed URL each time. Switching this off stops the link working
 * — which would be a fiction if the bucket were public.
 */
export async function setMarketingPublic(input: {
  id: string;
  isPublic: boolean;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();

  if (input.isPublic) {
    // Sharing an asset with nothing uploaded would hand somebody a link to a
    // page that cannot work. The database refuses to serve it either.
    const { data: asset } = await supabase
      .from("marketing_assets")
      .select("current_version_id")
      .eq("id", input.id)
      .maybeSingle();

    if (!asset?.current_version_id) {
      return { ok: false, error: "Upload a file before sharing this asset." };
    }
  }

  const { error } = await supabase
    .from("marketing_assets")
    .update({ is_public: input.isPublic })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/marketing/${input.id}`);
  revalidatePath("/admin/marketing");
  return {
    ok: true,
    message: input.isPublic
      ? "Shared. Anyone with the link can download it."
      : "Sharing off. The link stops working immediately.",
  };
}

export async function archiveMarketingAsset(input: {
  id: string;
  archived: boolean;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("marketing_assets")
    .update({ archived_at: input.archived ? new Date().toISOString() : null })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/marketing/${input.id}`);
  revalidatePath("/admin/marketing");
  return {
    ok: true,
    message: input.archived
      ? "Archived. Its link no longer works, and its web address is never reused."
      : "Restored.",
  };
}

/**
 * Rolling back to an earlier version.
 *
 * Goes through a database function rather than a plain update, because that
 * function refuses a version belonging to a different asset — something a bare
 * `update ... set current_version_id = $1` would happily accept.
 */
export async function setCurrentMarketingVersion(input: {
  assetId: string;
  versionId: string;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("set_current_marketing_version", {
    p_asset: input.assetId,
    p_version: input.versionId,
  });

  if (error) return { ok: false, error: error.message };
  if (data !== true) return { ok: false, error: "That version does not belong to this asset." };

  revalidatePath(`/admin/marketing/${input.assetId}`);
  return { ok: true, message: "The share link now serves that version." };
}

// ----------------------------------------------------------------- upload --

export async function createMarketingUploadUrl(input: {
  assetId: string;
  filename: string;
  byteSize: number;
}): Promise<
  { ok: true; uploadUrl: string; path: string; version: number } | { ok: false; error: string }
> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  if (input.byteSize > MAX_MARKETING_BYTES) {
    return { ok: false, error: "That file is larger than 200 MB." };
  }

  const supabase = await supabaseServer();
  const { data: asset } = await supabase
    .from("marketing_assets")
    .select("id")
    .eq("id", input.assetId)
    .maybeSingle();
  if (!asset) return { ok: false, error: "Asset not found." };

  // The next version number, for the storage path only. The database assigns
  // the authoritative number on insert — this is just so the path is readable
  // in the dashboard, and a timestamp in the path makes a race harmless.
  const { data: latest } = await supabase
    .from("marketing_asset_versions")
    .select("version")
    .eq("asset_id", input.assetId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = Number(latest?.version ?? 0) + 1;
  const path = marketingAssetPath(input.assetId, nextVersion, input.filename);

  const { data, error } = await supabaseAdmin()
    .storage.from(MARKETING_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not start the upload." };
  }
  return { ok: true, uploadUrl: data.signedUrl, path, version: nextVersion };
}

/**
 * Recording an upload as a new version.
 *
 * The database numbers it and promotes it to current in one trigger, so an
 * asset cannot end up serving the old file because somebody uploaded the new
 * one and got distracted before pressing a second button.
 */
export async function addMarketingVersion(input: {
  assetId: string;
  path: string;
  filename: string;
  contentType: string | null;
  byteSize: number;
  notes: string | null;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { data: file, error: fileError } = await supabase
    .from("files")
    .insert({
      storage_bucket: MARKETING_BUCKET,
      storage_path: input.path,
      original_filename: input.filename.slice(0, 255),
      content_type: input.contentType,
      byte_size: input.byteSize,
      uploaded_by: staff.id,
    })
    .select("id")
    .single();

  if (fileError) return { ok: false, error: fileError.message };

  const { error } = await supabase.from("marketing_asset_versions").insert({
    asset_id: input.assetId,
    file_id: file.id,
    notes: input.notes?.slice(0, 500) || null,
    uploaded_by: staff.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/marketing/${input.assetId}`);
  revalidatePath("/admin/marketing");
  return { ok: true, message: "Uploaded. The share link now serves this version." };
}

/** Staff preview of any version, current or not. */
export async function getMarketingVersionUrl(
  versionId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("marketing_asset_versions")
    .select("file:files!marketing_asset_versions_file_id_fkey ( storage_bucket, storage_path )")
    .eq("id", versionId)
    .maybeSingle();

  const row = Array.isArray(data?.file) ? data?.file[0] : data?.file;
  const file = (row as { storage_bucket?: string; storage_path?: string } | null) ?? null;
  if (!file?.storage_bucket || !file?.storage_path) {
    return { ok: false, error: "That file is not available." };
  }

  const { data: signed, error } = await supabaseAdmin()
    .storage.from(file.storage_bucket)
    .createSignedUrl(file.storage_path, MARKETING_DOWNLOAD_TTL_SECONDS);

  if (error || !signed) {
    return { ok: false, error: error?.message ?? "Could not open that file." };
  }
  return { ok: true, url: signed.signedUrl };
}

/** Suggests the slug the title would produce, for the create form. */
export async function previewMarketingSlug(title: string): Promise<string> {
  const slug = slugify(title);
  return isValidSlug(slug) ? slug : "";
}
