import type { Metadata } from "next";
import { PageHeader, Section, Card, ProposalCta } from "@/components/ui";
import { categories, servicesByCategory } from "@/content/services";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Land surveying, civil engineering and 3D reality capture services from TDR Engineering — boundary and ALTA surveys, architectural and topographic surveys, grading and drainage design, LiDAR scanning, scan-to-CAD and scan-to-BIM.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="Survey, civil engineering and reality capture — from one firm."
        intro="TDR's service architecture covers the full path from measuring what exists today to engineering what gets built next."
      />

      {(Object.keys(categories) as (keyof typeof categories)[]).map((key, index) => {
        const category = categories[key];
        return (
          <Section key={key} id={key} tone={index % 2 === 1 ? "muted" : "light"}>
            <div className="max-w-3xl">
              <p className="eyebrow">{`0${index + 1}`}</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-ink-900 md:text-4xl">
                {category.name}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-600">
                {category.blurb}
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {servicesByCategory(key).map((service) => (
                <Card
                  key={service.code}
                  href={`/services/${service.code}`}
                  title={service.name}
                  footer="Learn more"
                >
                  {service.summary}
                </Card>
              ))}
            </div>
          </Section>
        );
      })}

      {/* Spec §5: Phase 1 does not require every legacy service page to be
          rewritten before launch — highest-value pages ship first. */}
      <ProposalCta />
    </>
  );
}
