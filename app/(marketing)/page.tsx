import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import { Container } from "@/components/ui/container";
import { Section, SectionHeader } from "@/components/ui/section";
import { Reveal } from "@/components/motion/reveal";
import { Hero } from "./_components/hero";
import { StatsStrip } from "./_components/stats-strip";
import { TrustBar } from "./_components/trust-bar";
import { TierCards } from "./_components/tier-cards";
import { RoiScenarios } from "./_components/roi-scenarios";
import { HowItWorksSection } from "./_components/how-it-works-section";
import { FaqSection } from "./_components/faq-section";
import { FinalCta } from "./_components/final-cta";

export default async function PresaleLandingPage() {
  // Membership tier from the access cookie — Early Believers (round 1) is
  // reserved for tier-1 members (D-VIP/D-Pro levels 3-6).
  const cookieStore = await cookies();
  const access = await verifyAccessToken(cookieStore.get(ACCESS_COOKIE)?.value);
  const accessTier = access?.tier ?? null;

  return (
    <>
      <Hero />

      <Container className="pb-2">
        <Reveal>
          <StatsStrip />
        </Reveal>
        <div className="mt-10">
          <TrustBar />
        </div>
      </Container>

      <Section id="tiers">
        <SectionHeader
          eyebrow="Presale Tiers"
          title="Choose your tier"
          description="Tiers fill in order — the earlier you join, the lower your price."
        />
        <Reveal className="mt-12">
          <TierCards accessTier={accessTier} />
        </Reveal>
      </Section>

      <Section id="returns" className="pt-0">
        <SectionHeader
          eyebrow="Profit Scenarios"
          title="What you could make"
          description="Illustrative ROI by entry tier at different market caps — conditional on reaching each cap, not guaranteed."
        />
        <Reveal className="mx-auto mt-12 max-w-3xl">
          <RoiScenarios />
        </Reveal>
      </Section>

      <Section id="how-it-works" className="pt-0">
        <SectionHeader
          eyebrow="How It Works"
          title="From USDC to $DEGX in five steps"
        />
        <Reveal className="mt-12">
          <HowItWorksSection />
        </Reveal>
      </Section>

      <Section id="faq" className="pt-0">
        <SectionHeader eyebrow="FAQ" title="Questions, answered" />
        <Reveal className="mt-12">
          <FaqSection />
        </Reveal>
      </Section>

      <Section className="pt-0">
        <Reveal>
          <FinalCta />
        </Reveal>
      </Section>
    </>
  );
}
