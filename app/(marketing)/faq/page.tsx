import type { Metadata } from "next";
import { Section, SectionHeader } from "@/components/ui/section";
import { JsonLd } from "@/components/seo/json-ld";
import { FaqSection } from "../_components/faq-section";
import { faqItems } from "../_lib/content";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Common questions about the $DEGX presale: tiers, graduation, distribution timeline, USDC on Solana, and risk.",
};

export default function FaqPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <Section>
      <JsonLd data={faqSchema} />
      <SectionHeader
        eyebrow="FAQ"
        title="Questions, answered"
        description="Everything about the $DEGX presale, graduation, and distribution."
      />
      <div className="mt-12">
        <FaqSection />
      </div>
    </Section>
  );
}
