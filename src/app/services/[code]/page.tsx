import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Section, CheckList, Card, ProposalCta } from "@/components/ui";
import { pageServices, serviceByCode, servicesByCategory, categories } from "@/content/services";
import { site } from "@/content/site";

type Params = { params: Promise<{ code: string }> };

export function generateStaticParams() {
  return pageServices.map((service) => ({ code: service.code }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const service = serviceByCode(code);
  if (!service?.hasPage) return {};

  return {
    title: service.name,
    description: service.summary,
    alternates: { canonical: `/services/${service.code}` },
    openGraph: {
      title: `${service.name} | ${site.name}`,
      description: service.summary,
      url: `${site.url}/services/${service.code}`,
    },
  };
}

export default async function ServicePage({ params }: Params) {
  const { code } = await params;
  const service = serviceByCode(code);
  if (!service?.hasPage) notFound();

  const category = categories[service.category];
  const related = servicesByCategory(service.category)
    .filter((s) => s.code !== service.code)
    .slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    serviceType: category.name,
    description: service.summary,
    provider: { "@type": "ProfessionalService", name: site.legalName, url: site.url },
    url: `${site.url}/services/${service.code}`,
  };

  return (
    <>
      <PageHeader eyebrow={category.name} title={service.name} intro={service.summary} />

      <Section>
        <div className="grid gap-14 lg:grid-cols-[1.4fr_1fr] lg:gap-20">
          <div className="prose-tdr">
            {service.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="text-lg">
                {paragraph}
              </p>
            ))}
          </div>

          <aside className="rounded-xl border border-ink-100 bg-ink-50 p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-500">
              What this includes
            </h2>
            <div className="mt-5">
              <CheckList items={service.highlights} />
            </div>
            <Link
              href={`/request-a-proposal?service=${service.requestable ? service.code : ""}`}
              className="mt-8 inline-flex w-full items-center justify-center rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
            >
              Request a proposal
            </Link>
          </aside>
        </div>
      </Section>

      {related.length > 0 ? (
        <Section tone="muted">
          <h2 className="text-2xl font-bold text-ink-900">
            Related {category.name.toLowerCase()} services
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <Card
                key={item.code}
                href={`/services/${item.code}`}
                title={item.name}
                footer="Learn more"
              >
                {item.summary}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      <ProposalCta />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
