import type { Metadata } from "next";
import { PageHeader, Section, SectionHeading, CheckList, ProposalCta } from "@/components/ui";
import { site, hasPhone } from "@/content/site";

export const metadata: Metadata = {
  title: "About TDR Engineering",
  description:
    "TDR Engineering is a technology-driven land surveying, civil engineering and 3D reality-capture firm serving architects, engineers, contractors, developers and property owners.",
  alternates: { canonical: "/about" },
};

/**
 * TODO(tdr): the company history, licensure, staff and service-area copy below
 * is placeholder structure. Replace it with the verified About/company content
 * recovered during the Phase 1A archive (spec §3) and approved by TDR before
 * launch (spec §4).
 */
export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About TDR"
        title="A survey and engineering firm built around measurement technology."
        intro="TDR Engineering combines land surveying, civil engineering and 3D reality capture so project teams work from one accurate, measured record of the site."
      />

      <Section>
        <div className="grid gap-14 lg:grid-cols-[1.3fr_1fr] lg:gap-20">
          <div className="prose-tdr">
            <h2 className="text-2xl font-bold text-ink-900">What TDR does differently</h2>
            <p className="text-lg">
              Survey, civil engineering and scanning are usually three separate
              vendors, each with their own schedule and their own version of the
              site. TDR performs all three from the same measured data, which
              removes the coordination overhead that slows projects down and
              drives cost up.
            </p>
            <p className="text-lg">
              The practical result for a design team is a base file that
              reflects the real site, delivered in the format they already work
              in, on a schedule built around their submittal dates.
            </p>

            <h2 className="mt-12 text-2xl font-bold text-ink-900">Who TDR works with</h2>
            <p className="text-lg">
              TDR works directly with property owners and just as often
              alongside the professionals they hire — architects, structural and
              civil engineers, contractors, developers, facility managers and
              public agencies.
            </p>
            <p className="text-lg">
              A large share of TDR&apos;s work arrives by referral from those
              professionals. TDR tracks those relationships deliberately, so the
              people who send work our way are recognized rather than forgotten.
            </p>
          </div>

          <aside className="space-y-8">
            <div className="rounded-xl border border-ink-100 bg-ink-50 p-8">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-500">
                Capabilities at a glance
              </h2>
              <div className="mt-5">
                <CheckList
                  items={[
                    "Land surveying — boundary, ALTA, topographic, architectural, construction and as-built",
                    "Civil engineering — grading, drainage, hydrology, site and hillside development",
                    "3D scanning — LiDAR, scan-to-CAD, scan-to-BIM/Revit, industrial and facility capture",
                  ]}
                />
              </div>
            </div>

            <div className="rounded-xl border border-ink-100 bg-white p-8 shadow-panel">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-500">
                Contact
              </h2>
              <ul className="mt-5 space-y-3 text-ink-800">
                {hasPhone ? (
                  <li>
                    <a href={site.phoneHref} className="font-semibold hover:text-brand-500">
                      {site.phone}
                    </a>
                  </li>
                ) : null}
                <li>
                  <a href={`mailto:${site.email}`} className="font-semibold hover:text-brand-500">
                    {site.email}
                  </a>
                </li>
                {site.hours ? (
                  <li className="text-sm text-ink-600">{site.hours}</li>
                ) : null}
              </ul>
            </div>
          </aside>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow="How TDR works"
          title="What to expect on a TDR project"
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Scope defined explicitly",
              body: "Every proposal states what is included, what is delivered and on what schedule — so nobody is guessing what was quoted.",
            },
            {
              title: "Right-sized recommendations",
              body: "If your project does not need the largest scope, TDR will say so. A boundary survey nobody needed helps no one.",
            },
            {
              title: "Deliverables in your format",
              body: "CAD version, layer standards, Revit version and LOD are agreed up front rather than negotiated after delivery.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-ink-100 bg-white p-7">
              <h3 className="text-lg font-semibold text-ink-900">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <ProposalCta />
    </>
  );
}
