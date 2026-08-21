import Link from "next/link";
import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { SurveyComparison } from "@/components/survey-comparison";
import { Section, SectionHeading, Card, ButtonLink, CheckList } from "@/components/ui";
import { categories, servicesByCategory } from "@/content/services";
import { faqs } from "@/content/faqs";
import { site, hasPhone } from "@/content/site";

export const metadata: Metadata = {
  title: "Land Surveying, Civil Engineering & 3D Scanning",
  description: site.description,
  alternates: { canonical: "/" },
};

/**
 * Homepage. Section order follows the recommended flow in spec §4:
 * hero → value proposition → survey comparison → services → why TDR →
 * technology examples → industries served → request a proposal → questions →
 * contact.
 */
export default function HomePage() {
  const featuredFaqs = faqs.slice(0, 6);

  return (
    <>
      <Hero />

      {/* 2. Core value proposition */}
      <Section>
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="eyebrow">Why TDR is different</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-ink-900 md:text-4xl">
              One firm for the survey, the engineering, and the reality capture
              behind both.
            </h2>
            <div className="prose-tdr mt-6">
              <p>
                Most projects run survey, civil engineering and scanning through
                three separate vendors, each working from a different version of
                the site. TDR performs all three, from the same measured data,
                on the same schedule.
              </p>
              <p>
                That single source of truth is what makes fast turnaround and
                competitive pricing possible without cutting the level of detail
                your design team actually needs.
              </p>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/services">Explore services</ButtonLink>
              <ButtonLink href="/about" variant="secondary">
                About TDR
              </ButtonLink>
            </div>
          </div>

          <CheckList
            items={[
              "3D scanning integrated into applicable survey workflows, not sold as a premium add-on",
              "Deliverables in the CAD, Revit or BIM format your team already works in",
              "Existing conditions measured rather than interpolated between spot shots",
              "Survey, civil engineering and scanning coordinated by one firm",
              "Turnaround scheduled around your plan-check and design deadlines",
              "Pricing that competes with conventional survey services",
            ]}
          />
        </div>
      </Section>

      {/* 3. "Does Your Survey Look Like This?" */}
      <SurveyComparison />

      {/* 4. Primary services */}
      <Section tone="muted" id="services">
        <SectionHeading
          eyebrow="Services"
          title="What TDR does"
          intro="Land surveying, civil engineering and 3D reality capture — delivered together or independently, depending on what your project needs."
        />

        <div className="mt-14 space-y-14">
          {(Object.keys(categories) as (keyof typeof categories)[]).map((key) => {
            const category = categories[key];
            const items = servicesByCategory(key).slice(0, 4);
            return (
              <div key={key}>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="max-w-2xl">
                    <h3 className="text-xl font-bold text-ink-900">{category.name}</h3>
                    <p className="mt-2 text-ink-600">{category.blurb}</p>
                  </div>
                  <Link
                    href={key === "3d-scanning" ? "/3d-scanning" : `/services#${key}`}
                    className="text-sm font-semibold text-brand-600 hover:text-brand-500"
                  >
                    All {category.name.toLowerCase()} services →
                  </Link>
                </div>
                <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((service) => (
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
              </div>
            );
          })}
        </div>
      </Section>

      {/* 5. Why TDR */}
      <Section tone="dark">
        <SectionHeading
          tone="dark"
          eyebrow="Why TDR"
          title="Technology, speed, quality, and pricing that competes."
          intro="The four things clients tell us matter most — and how TDR delivers each one."
        />
        <div className="mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <Pillar
            index="01"
            title="Latest technology"
            body="LiDAR and reality capture are standard tools in TDR's applicable workflows, not a specialty service quoted separately."
          />
          <Pillar
            index="02"
            title="Fast turnaround"
            body="Scanning compresses field time, and schedules are built around your submittal and design deadlines rather than ours."
          />
          <Pillar
            index="03"
            title="Exceptional detail"
            body="Deliverables reflect measured conditions across the whole site, not a scatter of individually shot points."
          />
          <Pillar
            index="04"
            title="Competitive pricing"
            body="Integrated survey, engineering and scanning removes the coordination overhead that multiple vendors add to a project."
          />
        </div>
      </Section>

      {/* 6. Featured technology / project examples */}
      <Section>
        <SectionHeading
          eyebrow="Technology in the field"
          title="What reality capture looks like on a TDR project"
          intro="From field capture through registered point cloud to the CAD or Revit deliverable your team designs in."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <Step
            step="Capture"
            title="LiDAR in the field"
            body="Scanner setups are placed to cover the site completely and tied to survey control, so the data is coordinated, not just visually stitched."
          />
          <Step
            step="Register"
            title="Point cloud"
            body="Individual scans are registered into a single dense, measurable dataset covering the ground, structures and surrounding conditions."
          />
          <Step
            step="Deliver"
            title="CAD, Revit & BIM"
            body="The cloud becomes the deliverable your team works in — drafted CAD, an intelligent Revit model, or both, in your format."
          />
        </div>
        <div className="mt-10 rounded-xl border border-ink-100 bg-ink-50 p-6 text-sm text-ink-600">
          {/* TODO(tdr): replace with approved project examples and imagery
              recovered/selected during the Phase 1A archive (spec §3, §21). */}
          Project examples and case studies are being migrated from the previous
          site.{" "}
          <Link href="/projects" className="font-semibold text-brand-600 hover:text-brand-500">
            See what is published so far
          </Link>
          .
        </div>
      </Section>

      {/* 7. Industries and professionals served */}
      <Section tone="muted">
        <SectionHeading
          eyebrow="Who TDR works with"
          title="Industries and professionals served"
          intro="TDR works directly with owners and just as often alongside the professionals they hire. If you refer a client to TDR, we track that relationship — and we say thank you."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            "Architects",
            "Structural engineers",
            "Civil engineers",
            "General contractors",
            "Developers",
            "Property owners",
            "Facility and plant managers",
            "Public agencies",
          ].map((audience) => (
            <div
              key={audience}
              className="rounded-lg border border-ink-100 bg-white px-5 py-4 text-sm font-semibold text-ink-800"
            >
              {audience}
            </div>
          ))}
        </div>
      </Section>

      {/* 8. Request a Proposal */}
      <Section tone="dark">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Request a proposal</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-white md:text-4xl">
              No account. No login. Just tell us about the project.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-300">
              Give us the property, the services you think you need and your
              timeframe. If you are not sure which survey your project requires,
              describe the situation and TDR will recommend the right scope
              rather than the largest one.
            </p>
            <div className="mt-8">
              <ButtonLink href="/request-a-proposal" variant="accent">
                Start your request
              </ButtonLink>
            </div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-900 p-8">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-300">
              What to have ready
            </h3>
            <div className="mt-5">
              <CheckList
                tone="dark"
                items={[
                  "Project address, and the APN if you have it",
                  "What you are trying to accomplish",
                  "Your timeframe or submittal deadline",
                  "Any existing survey, title report or drawings",
                  "Who referred you, if a professional sent you our way",
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* 9. Questions / Knowledge Center */}
      <Section>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Knowledge center"
            title="Questions clients ask us most"
            intro="Straight answers to the questions that come up on almost every project."
          />
          <Link
            href="/questions"
            className="text-sm font-semibold text-brand-600 hover:text-brand-500"
          >
            Browse all questions →
          </Link>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featuredFaqs.map((faq) => (
            <Card
              key={faq.id}
              href={`/questions#${faq.id}`}
              title={faq.question}
              footer="Read the answer"
            >
              {faq.answer[0].slice(0, 140)}…
            </Card>
          ))}
        </div>
      </Section>

      {/* 10. Contact TDR */}
      <Section tone="muted">
        <div className="grid gap-10 rounded-2xl border border-ink-100 bg-white p-10 shadow-panel md:grid-cols-2 md:p-14">
          <div>
            <p className="eyebrow">Contact</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight text-ink-900">
              Talk to TDR
            </h2>
            <p className="mt-4 text-ink-600">
              Questions about scope, scheduling or whether scanning makes sense
              for your project? Call, email, or send a message and a member of
              the team will get back to you.
            </p>
          </div>
          <dl className="grid gap-6 sm:grid-cols-2">
            {hasPhone ? (
              <ContactItem label="Phone">
                <a href={site.phoneHref} className="hover:text-brand-500">
                  {site.phone}
                </a>
              </ContactItem>
            ) : null}
            <ContactItem label="Email">
              <a href={`mailto:${site.email}`} className="hover:text-brand-500">
                {site.email}
              </a>
            </ContactItem>
            {site.hours ? (
              <ContactItem label="Office hours">{site.hours}</ContactItem>
            ) : null}
            <ContactItem label="Send a message">
              <Link href="/contact" className="hover:text-brand-500">
                Contact form →
              </Link>
            </ContactItem>
          </dl>
        </div>
      </Section>
    </>
  );
}

function Pillar({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div>
      <span className="text-sm font-bold tracking-[0.2em] text-accent-400">{index}</span>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-300">{body}</p>
    </div>
  );
}

function Step({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-7 shadow-panel">
      <span className="inline-flex rounded-full bg-accent-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand-600">
        {step}
      </span>
      <h3 className="mt-5 text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-600">{body}</p>
    </div>
  );
}

function ContactItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
        {label}
      </dt>
      <dd className="mt-2 text-base font-semibold text-ink-900">{children}</dd>
    </div>
  );
}
