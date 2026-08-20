import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section, ProposalCta } from "@/components/ui";
import { projects } from "@/content/projects";
import { serviceByCode } from "@/content/services";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Examples of TDR Engineering survey, civil engineering and 3D scanning work — architectural scanning, hillside site development and industrial existing-conditions capture.",
  alternates: { canonical: "/projects" },
};

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="Work that starts from measured conditions."
        intro="A cross-section of the survey, engineering and reality-capture work TDR performs for architects, engineers, contractors, developers and owners."
      />

      <Section>
        {projects.length === 0 ? (
          <p className="max-w-2xl text-lg text-ink-600">
            Project examples are being migrated from the previous TDR website.
            In the meantime,{" "}
            <Link href="/request-a-proposal" className="font-semibold text-brand-600">
              request a proposal
            </Link>{" "}
            and TDR will share examples relevant to your project type directly.
          </p>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <article
                  key={project.slug}
                  className="flex h-full flex-col rounded-xl border border-ink-100 bg-white p-7 shadow-panel"
                >
                  <p className="eyebrow">{project.category}</p>
                  <h2 className="mt-3 text-lg font-semibold text-ink-900">
                    {project.title}
                  </h2>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-600">
                    {project.summary}
                  </p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {project.services.map((code) => {
                      const service = serviceByCode(code);
                      if (!service) return null;
                      return (
                        <li key={code}>
                          <Link
                            href={service.hasPage ? `/services/${code}` : "/services"}
                            className="inline-flex rounded-full bg-ink-50 px-3 py-1 text-xs font-medium text-ink-600 hover:bg-ink-100"
                          >
                            {service.name}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>

            {/* Spec §3/§21: content migration continues after launch. */}
            <p className="mt-12 rounded-xl border border-ink-100 bg-ink-50 p-6 text-sm text-ink-600">
              Additional project pages and case studies are being migrated from
              the previous TDR website. If you would like examples specific to
              your project type,{" "}
              <Link href="/contact" className="font-semibold text-brand-600">
                contact TDR
              </Link>{" "}
              and we will send them directly.
            </p>
          </>
        )}
      </Section>

      <ProposalCta />
    </>
  );
}
