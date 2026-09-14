"use server";

import { revalidatePath } from "next/cache";
import { getStaffUser, supabaseServer } from "@/lib/supabase/server";

/**
 * Disconnecting the Drive account.
 *
 * The row is retired rather than deleted, and the encrypted token is cleared
 * from it. Keeping the row preserves the record of which account was connected
 * and when — worth having if anybody later asks where a file went — while
 * clearing the token means a disconnected connection holds no credential at
 * all, not even an encrypted one.
 *
 * Nothing is removed from Drive. The files stay where they are; this
 * application simply stops being able to reach them.
 */
export async function disconnectDrive(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const staff = await getStaffUser();
  if (!staff || (staff.role !== "owner" && staff.role !== "manager")) {
    return { ok: false, error: "Only an owner or manager can change storage settings." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("storage_connections")
    .update({ is_active: false, refresh_token_enc: null })
    .eq("provider", "google_drive")
    .eq("is_active", true);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings/storage");
  return { ok: true };
}
