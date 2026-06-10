import Link from "next/link";
import { PRESALE, TIERS, TOKEN } from "@/lib/constants";
import { tokenPrice, usdCompact } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PresaleCountdown } from "@/components/marketing/presale-countdown";
import { BuyButton } from "@/components/presale/buy-button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* subtle backdrop glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-80 max-w-3xl rounded-full bg-accent/10 blur-3xl"
      />
      <Container className="flex flex-col items-center py-20 text-center sm:py-28">
        <Badge variant="accent">
          <span className="size-1.5 rounded-full bg-accent glow-accent" />
          Solana - {TOKEN.quoteCurrency} only
        </Badge>

        <h1 className="mt-6 max-w-4xl text-balance text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          Get in at <span className="text-accent">{tokenPrice(TIERS[0].price)}</span>{" "}
          before it steps up to {tokenPrice(TIERS[2].price)}
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-lg text-muted sm:text-xl">
          The $DEGX community presale on Solana. Three tiers, below-market entry,
          graduating to Jupiter Studio at a {usdCompact(TOKEN.graduationMarketCap)}{" "}
          market cap.
        </p>

        <div className="mt-10">
          <PresaleCountdown />
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <BuyButton tier={TIERS[0]} size="lg" />
          <Link
            href="/how-it-works"
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            How it works
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted">
          {TOKEN.quoteCurrency} on Solana · {PRESALE.durationDays}-day presale ·
          non-refundable · ROI shown is conditional, not guaranteed
        </p>
      </Container>
    </section>
  );
}
