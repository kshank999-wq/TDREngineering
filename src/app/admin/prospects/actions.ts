"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { buildImportPreview, type ImportCandidate } from "@/lib/marketing/csv-import";

/**
 * Staff actions for prospect lists.
 *
 * Everything writes through the RLS-scoped session client, so the database
 * enforces staff-only access independently of the checks here.
 *
 * The rule these all serve: suppression outranks list membership. Nothing in
 * this file decides who may be emailed — `v_marketing_list_members.sendable`
 * does, and it checks the global do-not-email table. Adding somebody to a list
 * is not consent and is not treated as any.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function createProspectList(formData: FormData) {
  const staff = await getStaffUser();
  if (!staff) throw new Error("Not authorized");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("A list needs a name");

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("marketing_lists")
    .insert({
      name: name.slice(0, 200),
      description: String(formData.get("description") ?? "").trim() || null,
      purpose: String(formData.get("purpose") ?? "").trim() || null,
      created_by: staff.id,
    })
    .select("id")
    .single();

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      throw new Error("There is already a list with that name.");
    }
    throw new Error(error.message);
  }

  redirect(`/admin/prospects/${data.id}`);
}

export async function updateProspectList(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id) return { ok: false, error: "Missing list." };
  if (!name) return { ok: false, error: "A list needs a name." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("marketing_lists")
    .update({
      name: name.slice(0, 200),
      description: String(formData.get("description") ?? "").trim() || null,
      purpose: String(formData.get("purpose") ?? "").trim() || null,
    })
    .eq("id", id);

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return { ok: false, error: "There is already a list with that name." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/prospects/${id}`);
  revalidatePath("/admin/prospects");
  return { ok: true, message: "Saved." };
}

export async function archiveProspectList(input: {
  id: string;
  archived: boolean;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("marketing_lists")
    .update({ archived_at: input.archived ? new Date().toISOString() : null })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/prospects/${input.id}`);
  revalidatePath("/admin/prospects");
  return { ok: true, message: input.archived ? "Archived." : "Restored." };
}

/**
 * Removing somebody from a list.
 *
 * NOT the same as unsubscribing, and the screen says so. Taking a person off
 * one list leaves them mailable everywhere else, which is right when the list
 * was simply wrong for them and very wrong when they asked to be left alone.
 * The second case is `suppressEmailAddress` below.
 */
export async function removeFromList(input: {
  listId: string;
  contactId: string;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("marketing_list_members")
    .delete()
    .eq("list_id", input.listId)
    .eq("contact_id", input.contactId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/prospects/${input.listId}`);
  return { ok: true };
}

/** Adds an existing contact to a list, by email or by id. */
export async function addContactToList(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const listId = String(formData.get("listId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!listId || !email) return { ok: false, error: "An email address is required." };

  const supabase = await supabaseServer();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("email", email)
    .is("archived_at", null)
    .maybeSingle();

  if (!contact) {
    return {
      ok: false,
      error: "No contact with that address. Import them, or add them as a client first.",
    };
  }

  const { error } = await supabase
    .from("marketing_list_members")
    .insert({ list_id: listId, contact_id: contact.id, source: "manual", added_by: staff.id });

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return { ok: false, error: "They are already on this list." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/prospects/${listId}`);
  return { ok: true, message: "Added." };
}

// ------------------------------------------------------------------ import --

export type ImportSummary = {
  total: number;
  added: number;
  matched: number;
  skipped: number;
  suppressed: number;
  duplicatesInFile: number;
  unmappedHeaders: string[];
};

/**
 * Reading the file before committing to it.
 *
 * Separate from the import itself so somebody can see what a spreadsheet will
 * do before it does it — how many rows have no address, which columns were
 * recognised, how many are already on the do-not-email list. A prospect list
 * is hard to un-import once the rows are mixed in with real contacts.
 */
export async function previewProspectImport(
  csv: string,
): Promise<
  | {
      ok: true;
      preview: {
        candidates: ImportCandidate[];
        skippedNoEmail: number;
        duplicatesInFile: number;
        headers: string[];
        recognised: string[];
        suppressed: number;
      };
    }
  | { ok: false; error: string }
> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  if (csv.length > 8 * 1024 * 1024) {
    return { ok: false, error: "That file is larger than 8 MB. Split it and import in parts." };
  }

  const parsed = buildImportPreview(csv);
  if (parsed.headers.length === 0) {
    return { ok: false, error: "That file appears to be empty." };
  }
  if (parsed.columns.email === null) {
    return {
      ok: false,
      error:
        "No email column was found. The first row must contain a header like 'Email' or 'Email Address'.",
    };
  }

  const recognised = Object.entries(parsed.columns)
    .filter(([, index]) => index !== null)
    .map(([key, index]) => `${parsed.headers[index as number]} → ${key}`);

  // How many of these are already opted out, so the number is visible BEFORE
  // the import rather than as a surprise in the sendable count afterwards.
  const supabase = await supabaseServer();
  let suppressed = 0;
  const emails = parsed.candidates.map((c) => c.email);
  for (let i = 0; i < emails.length; i += 500) {
    const { data } = await supabase
      .from("email_suppressions")
      .select("email")
      .in("email", emails.slice(i, i + 500));
    suppressed += data?.length ?? 0;
  }

  return {
    ok: true,
    preview: {
      candidates: parsed.candidates.slice(0, 2000),
      skippedNoEmail: parsed.skippedNoEmail,
      duplicatesInFile: parsed.duplicatesInFile,
      headers: parsed.headers,
      recognised,
      suppressed,
    },
  };
}

/**
 * The import itself.
 *
 * Matches on email first. A prospect who already exists — because they once
 * submitted a proposal request — is REUSED, not duplicated: that is the whole
 * reason lists are membership over `contacts` rather than their own table.
 *
 * Suppressed addresses are still imported and still added to the list. They
 * are simply never sendable, which the counts make plain. Silently dropping
 * them would mean the next import of the same spreadsheet adds them again,
 * and nobody would ever understand why the numbers moved.
 */
export async function runProspectImport(input: {
  listId: string;
  filename: string | null;
  csv: string;
}): Promise<{ ok: true; summary: ImportSummary } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const parsed = buildImportPreview(input.csv);
  if (parsed.columns.email === null) {
    return { ok: false, error: "No email column was found." };
  }
  if (parsed.candidates.length === 0) {
    return { ok: false, error: "No rows with a usable email address." };
  }

  const supabase = await supabaseServer();
  const { data: list } = await supabase
    .from("marketing_lists")
    .select("id")
    .eq("id", input.listId)
    .maybeSingle();
  if (!list) return { ok: false, error: "List not found." };

  let added = 0;
  let matched = 0;
  let skipped = 0;
  let suppressedCount = 0;

  // Batched rather than row-at-a-time: a 5,000-row trade show list would be
  // 15,000 round trips otherwise.
  const BATCH = 200;
  for (let i = 0; i < parsed.candidates.length; i += BATCH) {
    const batch = parsed.candidates.slice(i, i + BATCH);
    const emails = batch.map((c) => c.email);

    const [{ data: existing }, { data: suppressedRows }] = await Promise.all([
      supabase.from("contacts").select("id, email").in("email", emails).is("archived_at", null),
      supabase.from("email_suppressions").select("email").in("email", emails),
    ]);

    const byEmail = new Map<string, string>();
    for (const row of existing ?? []) {
      if (row.email) byEmail.set(String(row.email).toLowerCase(), row.id as string);
    }
    const suppressedSet = new Set(
      (suppressedRows ?? []).map((r) => String(r.email).toLowerCase()),
    );

    const toCreate = batch.filter((c) => !byEmail.has(c.email));

    if (toCreate.length > 0) {
      const { data: created, error } = await supabase
        .from("contacts")
        .insert(
          toCreate.map((c) => ({
            first_name: c.firstName || c.email.split("@")[0],
            last_name: c.lastName || "",
            email: c.email,
            phone: c.phone,
            title: c.title,
            // Imported prospects are industry contacts by default — this is a
            // marketing list, not an inbound enquiry. It is editable per
            // contact afterwards.
            is_professional: true,
            notes: input.filename ? `Imported from ${input.filename}` : "Imported",
          })),
        )
        .select("id, email");

      if (error) return { ok: false, error: `Could not create contacts: ${error.message}` };

      for (const row of created ?? []) {
        if (row.email) byEmail.set(String(row.email).toLowerCase(), row.id as string);
      }
      added += created?.length ?? 0;
    }

    matched += batch.length - toCreate.length;
    suppressedCount += batch.filter((c) => suppressedSet.has(c.email)).length;

    const members = batch
      .map((c) => byEmail.get(c.email))
      .filter((id): id is string => Boolean(id))
      .map((contactId) => ({
        list_id: input.listId,
        contact_id: contactId,
        source: "import",
        added_by: staff.id,
      }));

    if (members.length > 0) {
      // Already-on-the-list is not an error; it is the normal result of
      // importing an updated version of the same spreadsheet.
      const { error } = await supabase
        .from("marketing_list_members")
        .upsert(members, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
      if (error) return { ok: false, error: `Could not add to the list: ${error.message}` };
    }

    skipped += batch.length - members.length;
  }

  const summary: ImportSummary = {
    total: parsed.candidates.length + parsed.skippedNoEmail + parsed.duplicatesInFile,
    added,
    matched,
    skipped: skipped + parsed.skippedNoEmail,
    suppressed: suppressedCount,
    duplicatesInFile: parsed.duplicatesInFile,
    unmappedHeaders: [],
  };

  await supabase.from("marketing_imports").insert({
    list_id: input.listId,
    filename: input.filename,
    rows_total: summary.total,
    rows_added: summary.added,
    rows_matched: summary.matched,
    rows_skipped: summary.skipped,
    rows_suppressed: summary.suppressed,
    imported_by: staff.id,
  });

  revalidatePath(`/admin/prospects/${input.listId}`);
  revalidatePath("/admin/prospects");
  return { ok: true, summary };
}

// ------------------------------------------------------------- suppression --

/**
 * Adding an address to the global do-not-email list.
 *
 * Goes through `suppress_email()` rather than a direct insert, so the
 * normalisation, the idempotency and the keep-the-original-date rule live in
 * one place — including for the public unsubscribe route, which is not signed
 * in as anybody.
 */
export async function suppressEmailAddress(formData: FormData): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const reason = String(formData.get("reason") ?? "manual");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!email.includes("@")) return { ok: false, error: "That is not an email address." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("suppress_email", {
    p_email: email,
    p_reason: reason,
    p_source: "staff",
    p_notes: notes,
  });

  if (error) return { ok: false, error: error.message };
  if (data !== true) return { ok: false, error: "That address could not be added." };

  revalidatePath("/admin/prospects/suppressions");
  revalidatePath("/admin/prospects");
  return { ok: true, message: `${email} will not be emailed.` };
}

/**
 * Lifting a suppression.
 *
 * Works for bounces and manual entries only. An unsubscribe or a spam
 * complaint is refused by the database, whoever asks — see 0012. This surfaces
 * that refusal as a sentence rather than a raw error.
 */
export async function liftSuppression(email: string): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("email_suppressions")
    .delete()
    .eq("email", email.trim().toLowerCase());

  if (error) {
    if (/cannot be removed|unsubscrib|reported spam/i.test(error.message)) {
      return {
        ok: false,
        error:
          "This person unsubscribed or reported spam. That cannot be undone — they have to opt in again themselves.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/prospects/suppressions");
  return { ok: true, message: "Removed from the do-not-email list." };
}

/**
 * Bulk import of opt-outs from whatever actually sends the mail.
 *
 * Essential rather than nice-to-have: if TDR sends through an outside provider,
 * unsubscribes happen THERE, and without pulling them back this system would
 * happily hand out an export containing people who already opted out.
 */
export async function importSuppressions(input: {
  csv: string;
  reason: string;
  source: string | null;
}): Promise<{ ok: true; added: number; skipped: number } | { ok: false; error: string }> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "Not authorized." };

  const parsed = buildImportPreview(input.csv);
  // A bare list of addresses with no header is the usual export shape, so fall
  // back to treating every line as an address.
  const emails =
    parsed.candidates.length > 0
      ? parsed.candidates.map((c) => c.email)
      : input.csv
          .split(/\r?\n/)
          .map((l) => l.trim().toLowerCase())
          .filter((l) => l.includes("@") && !/\s/.test(l));

  if (emails.length === 0) {
    return { ok: false, error: "No email addresses found in that file." };
  }

  const supabase = await supabaseServer();
  let added = 0;
  let skipped = 0;

  for (const email of emails) {
    const { data, error } = await supabase.rpc("suppress_email", {
      p_email: email,
      p_reason: input.reason,
      p_source: input.source ?? "import",
      p_notes: null,
    });
    if (error || data !== true) skipped += 1;
    else added += 1;
  }

  revalidatePath("/admin/prospects/suppressions");
  revalidatePath("/admin/prospects");
  return { ok: true, added, skipped };
}
