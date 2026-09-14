import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { jobStatuses, jobStatusLabel, jobStatusTone } from "@/content/job-statuses";
import { statusClasses } from "@/content/statuses";
import { updateJobStatus, saveJobDetails, addJobNote } from "./actions";

export const metadata: Metadata = { title: "Job" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const money = (value: unknown) =>
  value == null
    ? "—"
    : Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" });

const day = (value: unknown) =>
  value ? new Date(`${String(value)}T00:00:00`).toLocaleDateString() : null;

/**
 * A job record. Everything that happens after a proposal is accepted hangs
 * here — deliverable files, invoices and the client's view of their own work
 * all attach to this row as they are built.
 */
export default async function JobDetailPage({ params }: Params) {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");

  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      `id, job_number, name, description, status, contract_amount, purchase_order,
       scheduled_start, field_complete, delivered_at, closed_at, notes,
       created_at, archived_at, assigned_to,
       opportunity:opportunities!jobs_opportunity_id_fkey ( id, opportunity_number, submitted_at ),
       contact:contacts!jobs_contact_id_fkey ( id, first_name, last_name, email, phone ),
       company:companies!jobs_company_id_fkey ( id, name ),
       property:properties!jobs_property_id_fkey ( address_line1, city, state, postal_code, apn )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  const [{ data: notes }, { data: history }, { data: team }] = await Promise.all([
    supabase
      .from("job_notes")
      .select("id, body, created_at, author:app_users ( full_name, email )")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_status_history")
      .select("id, from_status, to_status, changed_at")
      .eq("job_id", id)
      .order("changed_at", { ascending: false })
      .limit(20),
    supabase
      .from("app_users")
      .select("id, full_name, email")
      .neq("role", "client")
      .is("archived_at", null)
      .order("full_name"),
  ]);

  const contact = one(job.contact);
  const company = one(job.company);
  const property = one(job.property);
  const opportunity = one(job.opportunity);

  const site = property
    ? [property.address_line1, property.city, property.state, property.postal_code]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <div className="container-tdr py-10">
      <Link href="/admin/jobs" className="text-sm font-semibold text-brand-600">
        ← All jobs
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm font-semibold text-ink-500">
            {job.job_number as string}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-ink-900">{job.name as string}</h1>
          <p className="mt-1 text-sm text-ink-600">
            Opened{" "}
            {new Date(job.created_at as string).toLocaleDateString(undefined, {
              dateStyle: "long",
            })}
            {opportunity ? (
              <>
                {" · from "}
                <Link
                  href={`/admin/proposals/${opportunity.id}`}
                  className="text-brand-600 hover:underline"
                >
                  {opportunity.opportunity_number}
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ${
              statusClasses[jobStatusTone(job.status as string)]
            }`}
          >
            {jobStatusLabel(job.status as string)}
          </span>
          <form action={updateJobStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={job.id as string} />
            <label htmlFor="status" className="sr-only">
              Change status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={job.status as string}
              className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            >
              {jobStatuses.map((item) => (
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
          <Panel title="Client and site">
            <Detail label="Client">
              {contact ? (
                <Link
                  href={`/admin/clients/contact/${contact.id}`}
                  className="text-brand-600 hover:underline"
                >
                  {contact.first_name} {contact.last_name}
                </Link>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Company">
              {company ? (
                <Link
                  href={`/admin/clients/company/${company.id}`}
                  className="text-brand-600 hover:underline"
                >
                  {company.name}
                </Link>
              ) : (
                "—"
              )}
            </Detail>
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
            <Detail label="Project site">{site || "—"}</Detail>
            <Detail label="APN">{property?.apn || "—"}</Detail>
          </Panel>

          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Job details
            </h2>
            <form action={saveJobDetails} className="mt-4 space-y-4">
              <input type="hidden" name="id" value={job.id as string} />

              <Field name="name" label="Job name" defaultValue={job.name as string} />

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                  Scope
                </span>
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={(job.description as string) ?? ""}
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="contract_amount"
                  label="Contract amount"
                  defaultValue={job.contract_amount == null ? "" : String(job.contract_amount)}
                  placeholder="4850.00"
                  inputMode="decimal"
                />
                <Field
                  name="purchase_order"
                  label="Client PO / reference"
                  defaultValue={(job.purchase_order as string) ?? ""}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="scheduled_start"
                  label="Scheduled start"
                  type="date"
                  defaultValue={(job.scheduled_start as string) ?? ""}
                />
                <Field
                  name="field_complete"
                  label="Field work complete"
                  type="date"
                  defaultValue={(job.field_complete as string) ?? ""}
                />
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                  Assigned to
                </span>
                <select
                  name="assigned_to"
                  defaultValue={(job.assigned_to as string) ?? ""}
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {(team ?? []).map((person) => (
                    <option key={person.id as string} value={person.id as string}>
                      {(person.full_name as string) || (person.email as string)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                  Working notes
                </span>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={(job.notes as string) ?? ""}
                  className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                />
              </label>

              <button
                type="submit"
                className="rounded-md border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"
              >
                Save details
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-dashed border-ink-300 bg-ink-50 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Deliverables and invoicing
            </h2>
            <p className="mt-2 max-w-prose text-sm text-ink-600">
              Job files and billing attach to this record and are not built yet. The job number
              above is what they will hang off.
            </p>
          </section>
        </div>

        <aside className="space-y-6">
          <Panel title="Money and dates">
            <Detail label="Contract">
              <span className="font-mono tabular-nums">{money(job.contract_amount)}</span>
            </Detail>
            <Detail label="Scheduled">{day(job.scheduled_start) || "—"}</Detail>
            <Detail label="Field complete">{day(job.field_complete) || "—"}</Detail>
            <Detail label="Delivered">
              {job.delivered_at
                ? new Date(job.delivered_at as string).toLocaleDateString()
                : "—"}
            </Detail>
            <Detail label="Closed">
              {job.closed_at ? new Date(job.closed_at as string).toLocaleDateString() : "—"}
            </Detail>
          </Panel>

          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Status history
            </h2>
            <div className="mt-4">
              {(history ?? []).length > 0 ? (
                <ol className="space-y-2">
                  {(history ?? []).map((entry) => (
                    <li key={entry.id as string} className="text-xs text-ink-500">
                      {jobStatusLabel((entry.from_status as string) ?? "—")} →{" "}
                      <span className="font-semibold text-ink-700">
                        {jobStatusLabel(entry.to_status as string)}
                      </span>{" "}
                      · {new Date(entry.changed_at as string).toLocaleDateString()}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-500">
                  No status changes yet. Every change is recorded here automatically.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Internal notes
            </h2>
            <form action={addJobNote} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={job.id as string} />
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
                      <p className="whitespace-pre-wrap text-sm text-ink-800">
                        {note.body as string}
                      </p>
                      <p className="mt-1 text-xs text-ink-400">
                        {author?.full_name || author?.email || "TDR staff"} ·{" "}
                        {new Date(note.created_at as string).toLocaleString()}
                      </p>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** PostgREST types an embedded relation as an array even when the foreign key
 *  guarantees at most one row. This normalizes both shapes. */
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

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  type = "text",
  inputMode,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  type?: string;
  inputMode?: "decimal" | "text";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      <input
        type={type}
        name={name}
        inputMode={inputMode}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      />
    </label>
  );
}
