import type { Metadata } from "next";
import { PageHeader, Section, SectionHeading, Card, CheckList, ProposalCta } from "@/components/ui";
import { SurveyComparison } from "@/components/survey-comparison";
import { servicesByCategory } from "@/content/services";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "3D Scanning & Reality Capture",
  description:
    "TDR Engineering integrates LiDAR and 3D laser scanning into applicable survey workflows — architectural scanning, scan-to-CAD, scan-to-BIM/Revit, industrial capture and existing-conditions documentation.",
  alternates: { canonical: "/3d-scanning" },
  openGraph: {
    title: `3D Scanning & Reality Capture | ${site.name}`,
    description:
      "LiDAR and reality capture that documents existing conditions in far greater detail than a conventional field survey.",
    url: `${site.url}/3d-scanning`,
  },
};

export default function ScanningPage() {
  return (
    <>
      <PageHeader
        eyebrow="3D Scanning & Reality Capture"
        title="Measured reality, not a scatter of points."
        intro="TDR treats 3D scanning as part of the applicable survey workflow rather than a premium add-on — which is why TDR deliverables generally carry more measured detail at pricing that competes with conventional survey services."
      />

      <Section>
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="prose-tdr">
            <h2 className="text-2xl font-bold text-ink-900">
              What reality capture actually changes
            </h2>
            <p className="text-lg">
              A conventional survey measures individual points and interpolates
              everything in between. That is fine when the space between points
              is simple — and expensive when it is not, because the conditions
              nobody measured are the ones that surface during construction.
            </p>
            <p className="text-lg">
              Scanning measures millions of points. The result is a dataset that
              can be re-interrogated later: a dimension nobody thought to
              request at the time can usually still be pulled from the scan
              instead of triggering another site visit.
            </p>
          </div>
          <div className="rounded-xl border border-ink-100 bg-ink-50 p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-500">
              Why clients ask for it
            </h2>
            <div className="mt-5">
              <CheckList
                items={[
                  "Greater field detail across the whole site, not just where points were shot",
                  "High-density capture of existing conditions",
                  "Reduced risk of missed field conditions",
                  "Better documentation for architects, engineers, contractors and owners",
                  "Fast turnaround where applicable",
                  "Competitive pricing relative to conventional industry services",
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      <SurveyComparison />

      <Section tone="muted">
        <SectionHeading
          eyebrow="How it works"
          title="From field capture to the file your team designs in"
        />
        <div className="mt-12 grid gap-6 md:grid-cols-4">
          {[
            {
              step: "01",
              title: "Plan the capture",
              body: "Scan positions, control and access are planned before mobilization so the site is covered completely on the first visit.",
            },
            {
              step: "02",
              title: "Scan the site",
              body: "LiDAR setups record millions of measured points, tied to survey control so the data is coordinated rather than merely stitched.",
            },
            {
              step: "03",
              title: "Register and verify",
              body: "Individual scans are registered into one dataset and checked against control before any drafting starts.",
            },
            {
              step: "04",
              title: "Deliver",
              body: "The verified data becomes your deliverable: drafted CAD, an intelligent Revit model, measured analysis, or the point cloud itself.",
            },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-ink-100 bg-white p-7">
              <span className="text-sm font-bold tracking-[0.2em] text-accent-500">
                {item.step}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-ink-900">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Capabilities"
          title="Scanning and reality-capture services"
          intro="Applied to buildings, sites, plants and facilities — whatever needs to be documented as it actually is."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {servicesByCategory("3d-scanning").map((service) => (
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

      <ProposalCta
        title="Not sure whether scanning fits your project?"
        intro="Describe the site and what you are trying to accomplish. TDR will tell you whether scanning is the right tool — and quote the conventional approach if it is not."
      />
    </>
  );
}
