import type { Metadata } from "next";
import { PageHeader, Section, ProposalCta } from "@/components/ui";
import { QuestionsBrowser } from "@/components/questions-browser";
import { faqs } from "@/content/faqs";

export const metadata: Metadata = {
  title: "Questions",
  description:
    "Answers to the questions clients ask TDR Engineering most: what information a survey request needs, what a topographic or ALTA survey is, why TDR uses 3D scanning, what LiDAR is, and what deliverables your architect receives.",
  alternates: { canonical: "/questions" },
};

/**
 * Questions / Knowledge Center (spec §6) — reduces repetitive phone and email
 * questions while helping clients understand TDR's services and requirements.
 */
export default function QuestionsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer.join(" ") },
    })),
  };

  return (
    <>
      <PageHeader
        eyebrow="Knowledge center"
        title="Questions"
        intro="Straight answers to what clients ask most. If your question is not here, ask TDR directly — it will probably end up on this page."
      />

      <Section>
        <QuestionsBrowser />
      </Section>

      <ProposalCta
        title="Still have a question about your project?"
        intro="Describe the property and what you are trying to accomplish. TDR will tell you what the project actually needs."
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
