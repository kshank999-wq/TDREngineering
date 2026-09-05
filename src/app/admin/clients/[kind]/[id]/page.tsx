import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer, getStaffUser } from "@/lib/supabase/server";
import { statusLabel, statusTone, statusClasses } from "@/content/statuses";
import { AddressForm, type Address } from "@/components/admin/address-form";
import { ShippingPanel } from "@/components/admin/shipping-panel";
import { isShippingConfigured, isShippoTestMode } from "@/lib/env";

export const metadata: Metadata = { title: "Client" };
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ kind: string; id: string }> };

/**
 * The client record — one page answering "what is going on with this client",
 * and the place a shipping label gets printed from.
 *
 * People and firms are separate rows in separate tables (spec §8), so this
 * page is rendered for either and says which it is. Everything below the
 * identity block is the same question asked of both: what have they asked us
 * for, who have they sent us, and what have we mailed them.
 */
export default async function ClientDetailPage({ params }: Params) {
  const staff = await getStaffUser();
  if (!staff) redirect("/admin/login");

  const { kind, id } = await params;
  if (kind !== "contact" && kind !== "company") notFound();

  const supabase = await supabaseServer();
  const isContact = kind === "contact";

  const loaded = isContact
    ? await supabase
        .from("contacts")
        .select(
          `id, first_name, last_name, email, phone, title, preferred_contact,
           is_professional, notes, created_at, archived_at,
           address_line1, address_line2, city, state, postal_code, country,
           company:companies ( id, name, company_type )`,
        )
        .eq("id", id)
        .maybeSingle()
    : await supabase
        .from("companies")
        .select(
          `id, name, company_type, website, email, phone, notes, created_at, archived_at,
           address_line1, address_line2, city, state, postal_code, country`,
        )
        .eq("id", id)
        .maybeSingle();

  if (!loaded.data) notFound();

  // Two different tables, two different shapes. Which columns exist is decided
  // by `kind` a few lines up, so the fields are read positionally below.
  const record = loaded.data as Record<string, unknown>;

  const text = (key: string) => (record[key] == null ? null : String(record[key]));

  const company = isContact ? one(record.company) : null;
  const displayName = isContact
    ? [text("first_name"), text("last_name")].filter(Boolean).join(" ")
    : (text("name") ?? "");

  const address: Address = {
    address_line1: text("address_line1"),
    address_line2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    postal_code: text("postal_code"),
    country: text("country"),
  };
  const hasAddress = Boolean(
    address.address_line1 && address.city && address.state && address.postal_code,
  );

  const foreignKey = isContact ? "contact_id" : "company_id";
  const referralKey = isContact ? "referring_contact_id" : "referring_company_id";

  const [{ data: opportunities }, { data: referrals }, shipmentsResult, colleaguesResult] =
    await Promise.all([
      supabase
        .from("opportunities")
        .select(
          `id, opportunity_number, status, project_description, submitted_at,
           property:properties!opportunities_property_id_fkey ( address_line1, city, state )`,
        )
        .eq(foreignKey, id)
        .is("archived_at", null)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("referrals")
        .select(
          `id, source_code, created_at,
           opportunity:opportunities!referrals_opportunity_id_fkey (
             id, opportunity_number, status, submitted_at
           )`,
        )
        .eq(referralKey, id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("shipments")
        .select(
          "id, status, carrier, service_level, rate_amount, tracking_number, tracking_url, label_url, reference, is_test, created_at",
        )
        .eq(foreignKey, id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(25),
      // Only meaningful for a company: who works there.
      isContact
        ? Promise.resolve({ data: [] as Record<string, unknown>[] })
        : supabase
            .from("contacts")
            .select("id, first_name, last_name, email, phone, title")
            .eq("company_id", id)
            .is("archived_at", null)
            .order("last_name"),
    ]);

  const colleagues = (colleaguesResult.data ?? []) as Record<string, unknown>[];
  const shipments = shipmentsResult.data ?? [];
  // The shipments table arrives with migration 0003. Until it is applied the
  // query fails, and saying so beats an empty panel that looks like history.
  const shipmentsUnavailable = Boolean(shipmentsResult.error);

  return (
    <div className="container-tdr py-10">
      <Link href="/admin/clients" className="text-sm font-semibold text-brand-600">
        ← All clients
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{displayName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-600">
            <span className="inline-flex rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600">
              {isContact ? (record.is_professional ? "Professional" : "Client") : "Company"}
            </span>
            {isContact && text("title") ? <span>{text("title")}</span> : null}
            {company ? (
              <Link
                href={`/admin/clients/company/${company.id}`}
                className="text-brand-600 hover:underline"
              >
                {company.name}
              </Link>
            ) : null}
            {record.archived_at ? (
              <span className="font-semibold text-amber-700">Archived</span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Panel title="Contact">
            <Detail label="Email">
              {text("email") ? (
                <a href={`mailto:${text("email")}`} className="text-brand-600 hover:underline">
                  {text("email")}
                </a>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Phone">
              {text("phone") ? (
                <a href={`tel:${text("phone")}`} className="text-brand-600 hover:underline">
                  {text("phone")}
                </a>
              ) : (
                "—"
              )}
            </Detail>
            {isContact ? (
              <Detail label="Preferred contact">{text("preferred_contact") ?? "—"}</Detail>
            ) : (
              <>
                <Detail label="Website">
                  {text("website") ? (
                    <a
                      href={text("website") as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:underline"
                    >
                      {text("website")}
                    </a>
                  ) : (
                    "—"
                  )}
                </Detail>
                <Detail label="Type">{text("company_type") ?? "—"}</Detail>
              </>
            )}
            <Detail label="In the database since">
              {new Date(text("created_at") ?? "").toLocaleDateString(undefined, {
                dateStyle: "long",
              })}
            </Detail>
            {text("notes") ? (
              <Detail label="Notes">
                <span className="whitespace-pre-wrap">{text("notes")}</span>
              </Detail>
            ) : null}
          </Panel>

          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Mailing address
            </h2>
            <p className="mt-2 mb-5 text-sm text-ink-500">
              Where deliverables get mailed. This is not the project site — job
              addresses live on the property record.
            </p>
            <AddressForm kind={kind} id={id} address={address} />
          </section>

          <ListPanel title={`Proposal requests (${(opportunities ?? []).length})`}>
            {(opportunities ?? []).length === 0 ? (
              <p className="text-sm text-ink-500">Nothing requested yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {(opportunities ?? []).map((row) => {
                  const property = one(row.property);
                  return (
                    <li key={row.id as string} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/proposals/${row.id}`}
                          className="font-semibold text-brand-600 hover:text-brand-500"
                        >
                          {row.opportunity_number as string}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {new Date(row.submitted_at as string).toLocaleDateString()}
                          {property?.address_line1
                            ? ` · ${[property.address_line1, property.city].filter(Boolean).join(", ")}`
                            : ""}
                        </p>
                        {row.project_description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-ink-700">
                            {row.project_description as string}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                          statusClasses[statusTone(row.status as string)]
                        }`}
                      >
                        {statusLabel(row.status as string)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </ListPanel>

          <ListPanel title={`Referrals sent to TDR (${(referrals ?? []).length})`}>
            {(referrals ?? []).length === 0 ? (
              <p className="text-sm text-ink-500">
                No work has been referred to TDR by this{" "}
                {isContact ? "person" : "firm"} yet.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {(referrals ?? []).map((row) => {
                  const opportunity = one(row.opportunity);
                  if (!opportunity) return null;
                  return (
                    <li key={row.id as string} className="flex items-center justify-between gap-4 py-3">
                      <Link
                        href={`/admin/proposals/${opportunity.id}`}
                        className="text-sm font-semibold text-brand-600 hover:text-brand-500"
                      >
                        {opportunity.opportunity_number}
                      </Link>
                      <span className="text-xs text-ink-500">
                        {new Date(opportunity.submitted_at).toLocaleDateString()} ·{" "}
                        {statusLabel(opportunity.status)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </ListPanel>

          {!isContact ? (
            <ListPanel title={`People at ${displayName} (${colleagues.length})`}>
              {colleagues.length === 0 ? (
                <p className="text-sm text-ink-500">No people recorded at this firm.</p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {colleagues.map((person) => (
                    <li key={person.id as string} className="flex items-start justify-between gap-4 py-3">
                      <div>
                        <Link
                          href={`/admin/clients/contact/${person.id}`}
                          className="text-sm font-semibold text-brand-600 hover:text-brand-500"
                        >
                          {String(person.first_name ?? "")} {String(person.last_name ?? "")}
                        </Link>
                        {person.title ? (
                          <p className="text-xs text-ink-500">{person.title as string}</p>
                        ) : null}
                      </div>
                      <span className="text-xs text-ink-500">
                        {(person.email as string) || (person.phone as string) || ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </ListPanel>
          ) : null}

          <ListPanel title={`Shipments (${shipments.length})`}>
            {shipmentsUnavailable ? (
              <p className="text-sm text-amber-800">
                Shipment history is unavailable — apply{" "}
                <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">
                  supabase/migrations/0003_shipping.sql
                </code>{" "}
                in the Supabase SQL editor.
              </p>
            ) : shipments.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing has been mailed to this client yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {shipments.map((row) => (
                  <li key={row.id as string} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">
                        {[row.carrier, row.service_level].filter(Boolean).join(" · ") ||
                          "Shipping label"}
                        {row.is_test ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            test
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {new Date(row.created_at as string).toLocaleString()}
                        {row.rate_amount ? ` · $${Number(row.rate_amount).toFixed(2)}` : ""}
                      </p>
                      {row.reference ? (
                        <p className="mt-1 text-sm text-ink-700">{row.reference as string}</p>
                      ) : null}
                      {row.tracking_number ? (
                        <p className="mt-1 font-mono text-xs text-ink-600">
                          {row.tracking_url ? (
                            <a
                              href={row.tracking_url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 hover:underline"
                            >
                              {row.tracking_number as string}
                            </a>
                          ) : (
                            (row.tracking_number as string)
                          )}
                        </p>
                      ) : null}
                    </div>
                    {row.label_url ? (
                      <a
                        href={row.label_url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50"
                      >
                        Reprint
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </ListPanel>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
              Ship to this client
            </h2>
            {hasAddress ? (
              <address className="mt-3 mb-5 text-sm not-italic leading-relaxed text-ink-700">
                {displayName}
                <br />
                {address.address_line1}
                {address.address_line2 ? (
                  <>
                    <br />
                    {address.address_line2}
                  </>
                ) : null}
                <br />
                {address.city}, {address.state} {address.postal_code}
              </address>
            ) : (
              <div className="mt-3 mb-5" />
            )}
            <ShippingPanel
              kind={kind}
              id={id}
              hasAddress={hasAddress}
              configured={isShippingConfigured()}
              testMode={isShippoTestMode()}
            />
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

function ListPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
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
