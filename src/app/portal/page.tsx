import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer, getClientUser } from "@/lib/supabase/server";
import { jobStatusLabel, jobStatusTone } from "@/content/job-statuses";
import { statusClasses } from "@/content/statuses";
import { invoiceStateLabel, invoiceStateTone, money } from "@/content/billing";
import { touchLastSeen } from "./actions";

export const metadata: Metadata = { title: "Your projects" };
export const dynamic = "force-dynamic";

/**
 * What a client sees first: their work, and anything they owe.
 *
 * Every query here reads a portal view. Those views bypass RLS and filter
 * through `client_can_see_job()` themselves, so this page cannot widen what a
 * client sees no matter what it asks for.
 */
export default async function PortalHome() {
  const client = await getClientUser();
  if (!client) return null; // layout has already redirected

  await touchLastSeen();

  const supabase = await supabaseServer();
  const [{ data: jobs }, { data: invoices }] = await Promise.all([
    supabase.from("v_portal_jobs").select("*").order("created_at", { ascending: false }),
    supabase.from("v_portal_invoices").select("*").order("issue_date", { ascending: false }),
  ]);

  const allJobs = jobs ?? [];
  const allInvoices = invoices ?? [];
  const open = allJobs.filter((j) => !["complete", "cancelled"].includes(j.status as string));
  const owed = allInvoices
    .filter((i) => i.state !== "paid" && i.state !== "void")
    .reduce((sum, i) => sum + Number(i.balance ?? 0), 0);

  return (
    <div className="container-tdr py-10">
      <h1 className="text-2xl font-bold text-ink-900">
        {client.fullName ? `Welcome, ${client.fullName.split(" ")[0]}` : "Your projects"}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        {open.length > 0
          ? `${open.length} project${open.length === 1 ? "" : "s"} underway with TDR Engineering.`
          : "Your work with TDR Engineering."}
      </p>

      {owed > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              Outstanding
            </p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-amber-900">
              {money(owed)}
            </p>
          </div>
          <p className="max-w-md text-sm text-amber-900">
            Across {allInvoices.filter((i) => i.state !== "paid" && i.state !== "void").length}{" "}
            invoice(s). Get in touch with TDR if anything looks wrong.
          </p>
        </div>
      ) : null}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-ink-500">
        Projects
      </h2>

      {allJobs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-ink-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-600">
            Nothing here yet. When TDR opens a project for you it will appear on this page.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {allJobs.map((job) => (
            <li key={job.id as string}>
              <Link
                href={`/portal/jobs/${job.id}`}
                className="block h-full rounded-xl border border-ink-200 bg-white p-5 transition-colors hover:border-brand-500"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-xs font-semibold text-ink-500">
                    {job.job_number as string}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                      statusClasses[jobStatusTone(job.status as string)]
                    }`}
                  >
                    {jobStatusLabel(job.status as string)}
                  </span>
                </div>
                <p className="mt-2 font-semibold text-ink-900">{job.name as string}</p>
                {job.property_address ? (
                  <p className="mt-1 text-sm text-ink-500">
                    {[job.property_address, job.property_city].filter(Boolean).join(", ")}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {allInvoices.length > 0 ? (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-ink-500">
            Invoices
          </h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-ink-200 bg-white">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Invoice</th>
                  <th className="px-5 py-3 font-semibold">Due</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                  <th className="px-5 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {allInvoices.map((row) => (
                  <tr key={row.id as string}>
                    <td className="px-5 py-4 font-mono text-xs text-ink-700">
                      {row.invoice_number as string}
                    </td>
                    <td className="px-5 py-4 text-ink-600">
                      {row.due_date
                        ? new Date(`${row.due_date}T00:00:00`).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                          statusClasses[invoiceStateTone(row.state as string)]
                        }`}
                      >
                        {invoiceStateLabel(row.state as string)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-mono tabular-nums text-ink-600">
                      {money(row.total)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono font-semibold tabular-nums text-ink-900">
                      {Number(row.balance) > 0 ? money(row.balance) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
