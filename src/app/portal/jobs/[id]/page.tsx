import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getClientUser } from "@/lib/supabase/server";
import { jobStatusLabel, jobStatusTone } from "@/content/job-statuses";
import { statusClasses } from "@/content/statuses";
import { invoiceStateLabel, invoiceStateTone, money } from "@/content/billing";
import { PortalFileList, type PortalFile } from "@/components/portal/file-list";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Stages a client is shown. On Hold and Cancelled are real but not a step. */
const TRACK = ["scheduled", "field_work", "processing", "review", "delivered", "complete"];

export default async function PortalJobPage({ params }: Params) {
  const client = await getClientUser();
  if (!client) return null;

  const { id } = await params;
  const supabase = await supabaseServer();

  // Not found and not yours are the same answer: the view returns nothing
  // either way, and saying which would confirm the job exists.
  const { data: job } = await supabase
    .from("v_portal_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  const [{ data: files }, { data: invoices }] = await Promise.all([
    supabase
      .from("v_portal_files")
      .select("id, name, original_filename, byte_size, category, uploaded_at")
      .eq("job_id", id)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("v_portal_invoices")
      .select("*")
      .eq("job_id", id)
      .order("issue_date", { ascending: false }),
  ]);

  const status = job.status as string;
  const reached = TRACK.indexOf(status);
  const site = [job.property_address, job.property_city, job.property_state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="container-tdr py-10">
      <Link href="/portal" className="text-sm font-semibold text-brand-600">
        ← Your projects
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm font-semibold text-ink-500">
            {job.job_number as string}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-ink-900">{job.name as string}</h1>
          {site ? <p className="mt-1 text-sm text-ink-600">{site}</p> : null}
        </div>
        <span
          className={`inline-flex rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ${
            statusClasses[jobStatusTone(status)]
          }`}
        >
          {jobStatusLabel(status)}
        </span>
      </div>

      {reached >= 0 ? (
        <ol className="mt-8 grid gap-2 sm:grid-cols-6">
          {TRACK.map((step, i) => (
            <li key={step}>
              <div
                className={`h-1.5 rounded-full ${i <= reached ? "bg-brand-600" : "bg-ink-200"}`}
              />
              <p
                className={`mt-2 text-xs ${
                  i === reached ? "font-semibold text-ink-900" : "text-ink-500"
                }`}
              >
                {jobStatusLabel(step)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This project is {jobStatusLabel(status).toLowerCase()}. Contact TDR if you have any
          questions.
        </p>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Documents
          </h2>
          <div className="mt-4">
            <PortalFileList files={(files ?? []) as PortalFile[]} />
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Dates
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              {([
                ["Scheduled", job.scheduled_start],
                ["Field work done", job.field_complete],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="text-ink-900">
                    {value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "—"}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Delivered</dt>
                <dd className="text-ink-900">
                  {job.delivered_at
                    ? new Date(job.delivered_at as string).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>

          {(invoices ?? []).length > 0 ? (
            <section className="rounded-xl border border-ink-200 bg-white p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                Invoices
              </h2>
              <ul className="mt-4 divide-y divide-ink-100">
                {(invoices ?? []).map((row) => (
                  <li key={row.id as string} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-ink-600">
                        {row.invoice_number as string}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                          statusClasses[invoiceStateTone(row.state as string)]
                        }`}
                      >
                        {invoiceStateLabel(row.state as string)}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-sm tabular-nums text-ink-900">
                      {money(row.total)}
                      {Number(row.balance) > 0 ? (
                        <span className="ml-2 text-xs font-normal text-ink-500">
                          {money(row.balance)} due
                        </span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
