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
import { RaisedCounter } from "@/components/marketing/raised-counter";
import { LiveBuysFeed } from "@/components/marketing/live-buys-feed";

export default function PresaleLandingPage() {
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
          <TierCards />
        </Reveal>
      </Section>

      <Section id="live" className="pt-0">
        <SectionHeader
          eyebrow="Live"
          title="Join the momentum"
          description="Real-time contributions from the community as the presale fills."
        />
        <Reveal className="mx-auto mt-12 grid max-w-2xl gap-6">
          <RaisedCounter />
          <LiveBuysFeed />
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
