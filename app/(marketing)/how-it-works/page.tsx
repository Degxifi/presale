import type { Metadata } from "next";
import { Section, SectionHeader } from "@/components/ui/section";
import { HowItWorksSection } from "../_components/how-it-works-section";
import { FinalCta } from "../_components/final-cta";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "How the $DEGX presale works: connect a Solana wallet, choose a tier, send USDC, and receive $DEGX after graduation to Jupiter Studio.",
};

export default function HowItWorksPage() {
  return (
    <>
      <Section>
        <SectionHeader
          eyebrow="How It Works"
          title="From USDC to $DEGX in five steps"
          description="A simple, non-custodial flow on Solana. You stay in control of your wallet the whole time."
        />
        <div className="mt-12">
          <HowItWorksSection />
        </div>
      </Section>
      <Section className="pt-0">
        <FinalCta />
      </Section>
    </>
  );
}
