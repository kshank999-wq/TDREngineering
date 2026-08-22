import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { opportunityStatuses, statusLabel, statusTone, statusClasses } from "@/content/statuses";
import { referralSourceByCode } from "@/content/referrals";
import { formatBytes } from "@/lib/uploads";
import { updateStatus, addNote } from "./actions";

export const metadata: Metadata = { title: "Proposal request" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Signed URLs are short-lived — the bucket itself is private (spec §15). */
const SIGNED_URL_TTL_SECONDS = 300;

export default async function ProposalDetailPage({ params }: Params) {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");

  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select(
      `
      id, opportunity_number, project_number, status, project_description,
      requested_timeframe, approximate_size, service_details, source, source_page,
      submitted_at, created_at,
      contact:contacts!opportunities_contact_id_fkey (
        id, first_name, last_name, email, phone, preferred_contact, is_professional
      ),
      company:companies!opportunities_company_id_fkey ( id, name, company_type ),
      property:properties!opportunities_property_id_fkey (
        id, address_line1, city, state, postal_code, apn, property_type
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (!opportunity) notFound();

  const [{ data: services }, { data: referral }, { data: files }, { data: notes }, { data: history }] =
    await Promise.all([
      supabase
        .from("opportunity_services")
        .select("details, service:services ( code, name, category )")
        .eq("opportunity_id", id),
      supabase
        .from("referrals")
        .select(
          `
          source_code, raw_name, raw_company, raw_email, raw_phone, notes,
          referring_contact:contacts!referrals_referring_contact_id_fkey ( id, first_name, last_name, email, phone ),
          referring_company:companies!referrals_referring_company_id_fkey ( id, name )
        `,
        )
        .eq("opportunity_id", id)
        .maybeSingle(),
      supabase
        .from("files")
        .select("id, storage_bucket, storage_path, original_filename, content_type, byte_size, created_at")
        .eq("opportunity_id", id)
        .is("archived_at", null)
        .order("created_at"),
      supabase
        .from("opportunity_notes")
        .select("id, body, created_at, author:app_users ( full_name, email )")
        .eq("opportunity_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("opportunity_status_history")
        .select("id, from_status, to_status, changed_at")
        .eq("opportunity_id", id)
        .order("changed_at", { ascending: false })
        .limit(10),
    ]);

  // Signed download links for the private attachment bucket.
  const signedFiles = await Promise.all(
    (files ?? []).map(async (file) => {
      const { data } = await supabase.storage
        .from(file.storage_bucket as string)
        .createSignedUrl(file.storage_path as string, SIGNED_URL_TTL_SECONDS);
      return { ...file, url: data?.signedUrl ?? null };
    }),
  );

  const contact = one(opportunity.contact);
  const company = one(opportunity.company);
  const property = one(opportunity.property);
  const referralSource = referral ? referralSourceByCode(referral.source_code as string) : null;
  const serviceDetails = (opportunity.service_details ?? {}) as Record<string, string>;

  return (
    <div className="container-tdr py-10">
      <Link href="/admin/proposals" className="text-sm font-semibold text-brand-600">
        ← All proposal requests
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            {opportunity.opportunity_number as string}
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Received{" "}
            {new Date(opportunity.submitted_at as string).toLocaleString(undefined, {
              dateStyle: "long",
              timeStyle: "short",
            })}
            {opportunity.source ? ` · via ${opportunity.source}` : ""}
          </p>
        </div>
        {/* Changing status is the primary action on this page, so the control
            lives in the header rather than the sidebar — the sidebar stacks
            below five read-only panels under 1024px, which put the main action
            off the bottom of the screen on any laptop-width window. */}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ${
              statusClasses[statusTone(opportunity.status as string)]
            }`}
          >
            {statusLabel(opportunity.status as string)}
          </span>
          <form action={updateStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={opportunity.id as string} />
            <label htmlFor="status" className="sr-only">
              Change status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={opportunity.status as string}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            >
              {opportunityStatuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
            >
              Update
            </button>
          </form>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Panel title="Client">
            <Detail label="Name">
              {contact ? `${contact.first_name} ${contact.last_name}` : "—"}
            </Detail>
            <Detail label="Company">{company?.name ?? "—"}</Detail>
            <Detail label="Email">
              {contact?.email ? (
                <a href={`mailto:${contact.email}`} className="text-brand-600 hover:underline">
                  {contact.email}
                </a>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Phone">
              {contact?.phone ? (
                <a href={`tel:${contact.phone}`} className="text-brand-600 hover:underline">
                  {contact.phone}
                </a>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Preferred contact">{contact?.preferred_contact ?? "—"}</Detail>
          </Panel>

          <Panel title="Property">
            <Detail label="Address">{property?.address_line1 ?? "—"}</Detail>
            <Detail label="City / State / ZIP">
              {property
                ? [property.city, property.state, property.postal_code].filter(Boolean).join(", ") || "—"
                : "—"}
            </Detail>
            <Detail label="APN">{property?.apn || "—"}</Detail>
            <Detail label="Property type">{property?.property_type ?? "—"}</Detail>
            <Detail label="Approximate size">
              {(opportunity.approximate_size as string) || "—"}
            </Detail>
          </Panel>

          <Panel title="Request">
            <Detail label="Services requested">
              {(services ?? []).length > 0
                ? (services ?? [])
                    .map((row) => (row.service as { name?: string } | null)?.name)
                    .filter(Boolean)
                    .join(", ")
                : "—"}
            </Detail>
            <Detail label="Requested timeframe">
              {(opportunity.requested_timeframe as string) || "—"}
            </Detail>
            <div className="pt-2">
              <dt className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Description
              </dt>
              <dd className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
                {(opportunity.project_description as string) || "—"}
              </dd>
            </div>
            {Object.keys(serviceDetails).length > 0 ? (
              <div className="pt-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                  Service details
                </dt>
                <dd className="mt-2 space-y-1.5">
                  {Object.entries(serviceDetails).map(([key, value]) =>
                    value ? (
                      <p key={key} className="text-sm text-ink-800">
                        <span className="font-medium text-ink-600">{key}:</span> {value}
                      </p>
                    ) : null,
                  )}
                </dd>
              </div>
            ) : null}
          </Panel>

          <Panel title="Referral">
            {referral ? (
              <>
                <Detail label="Source">{referralSource?.label ?? (referral.source_code as string)}</Detail>
                <Detail label="Referred by">
                  {(() => {
                    const person = one(referral.referring_contact);
                    if (person) {
                      return (
                        <span>
                          {person.first_name} {person.last_name}
                          {person.email ? (
                            <a href={`mailto:${person.email}`} className="ml-2 text-brand-600 hover:underline">
                              {person.email}
                            </a>
                          ) : null}
                        </span>
                      );
                    }
                    return (referral.raw_name as string) || "—";
                  })()}
                </Detail>
                <Detail label="Referring company">
                  {one(referral.referring_company)?.name ||
                    (referral.raw_company as string) ||
                    "—"}
                </Detail>
                <Detail label="Referring phone">{(referral.raw_phone as string) || "—"}</Detail>
                {referral.notes ? <Detail label="Notes">{referral.notes as string}</Detail> : null}
              </>
            ) : (
              <p className="text-sm text-ink-500">No referral recorded.</p>
            )}
          </Panel>

          <Panel title={`Uploaded documents (${signedFiles.length})`}>
            {signedFiles.length === 0 ? (
              <p className="text-sm text-ink-500">No documents were attached.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {signedFiles.map((file) => (
                  <li key={file.id as string} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {file.original_filename as string}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatBytes(Number(file.byte_size ?? 0))}
                        {file.content_type ? ` · ${file.content_type}` : ""}
                      </p>
                    </div>
                    {file.url ? (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="shrink-0 text-xs text-ink-400">Link unavailable</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-400">
              Download links are signed and expire after {SIGNED_URL_TTL_SECONDS / 60} minutes.
            </p>
          </Panel>
        </div>

        <aside className="space-y-6">
          {/* The control moved to the header; the audit trail stays here. */}
          <Panel title="Status history">
            {(history ?? []).length > 0 ? (
              <ol className="space-y-2">
                {(history ?? []).map((entry) => (
                  <li key={entry.id as string} className="text-xs text-ink-500">
                    {statusLabel((entry.from_status as string) ?? "—")} →{" "}
                    <span className="font-semibold text-ink-700">
                      {statusLabel(entry.to_status as string)}
                    </span>{" "}
                    · {new Date(entry.changed_at as string).toLocaleDateString()}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-500">
                No status changes yet. Every change is recorded here
                automatically.
              </p>
            )}
          </Panel>

          <Panel title="Internal notes">
            <form action={addNote} className="space-y-3">
              <input type="hidden" name="id" value={opportunity.id as string} />
              <label htmlFor="body" className="sr-only">
                Add an internal note
              </label>
              <textarea
                id="body"
                name="body"
                rows={3}
                required
                placeholder="Add a note for the team…"
                className="w-full rounded-md border border-ink-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
              />
              <button
                type="submit"
                className="w-full rounded-md border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"
              >
                Add note
              </button>
            </form>

            <ul className="mt-5 space-y-4 border-t border-ink-100 pt-4">
              {(notes ?? []).length === 0 ? (
                <li className="text-sm text-ink-500">No notes yet.</li>
              ) : (
                (notes ?? []).map((note) => {
                  const author = one(note.author);
                  return (
                    <li key={note.id as string}>
                      <p className="text-sm whitespace-pre-wrap text-ink-800">{note.body as string}</p>
                      <p className="mt-1 text-xs text-ink-400">
                        {author?.full_name || author?.email || "TDR staff"} ·{" "}
                        {new Date(note.created_at as string).toLocaleString()}
                      </p>
                    </li>
                  );
                })
              )}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/**
 * PostgREST types an embedded relation as an array even when the foreign key
 * guarantees at most one row. This normalizes both shapes to a single record.
 */
function one(value: unknown): Record<string, string> | null {
  if (!value) return null;
  const record = Array.isArray(value) ? value[0] : value;
  return (record as Record<string, string>) ?? null;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">{title}</h2>
      <dl className="mt-4 space-y-3">{children}</dl>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="text-sm text-ink-900">{children}</dd>
    </div>
  );
}
