import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BuyButton } from "@/components/presale/buy-button";
import { WalletTierCap } from "@/components/marketing/wallet-tier-cap";
import { LaunchCountdown } from "@/components/marketing/countdown";
import { cn } from "@/lib/utils";
import { isTierEligible } from "@/lib/presale";
import { num, percent, tokenPrice, usd } from "@/lib/format";
import type { Tier, TierId, TierStatus } from "@/types/presale";

// Full literal class strings per tier so Tailwind can detect them.
const VIS: Record<
  TierId,
  { emoji: string; bar: string; ring: string; tint: string }
> = {
  1: { emoji: "🌱", bar: "bg-tier-1-ring", ring: "ring-tier-1-ring/50", tint: "from-tier-1" },
  2: { emoji: "💎", bar: "bg-tier-2-ring", ring: "ring-tier-2-ring/50", tint: "from-tier-2" },
  3: { emoji: "🚀", bar: "bg-tier-3-ring", ring: "ring-tier-3-ring/50", tint: "from-tier-3" },
};

function statusLabel(status: TierStatus): string {
  if (status === "active") return "Open now";
  if (status === "paused") return "Paused";
  if (status === "closed" || status === "ended" || status === "filled")
    return "Closed";
  return "Opens at launch"; // all tiers open at launch (time-based, no targets)
}

export function TierCard({
  tier,
  raised,
  status,
  featured = false,
  accessTier = null,
  startsAt = null,
}: {
  tier: Tier;
  raised: number;
  status: TierStatus;
  featured?: boolean;
  accessTier?: 1 | 2 | null;
  startsAt?: string | null;
}) {
  const v = VIS[tier.id];
  const pct = (raised / tier.raiseTarget) * 100;
  const isOpen = status === "active";
  // Cumulative access: T1 → tier-1 members; T2 → any member; T3 → everyone.
  const eligible = isTierEligible(tier.id, accessTier);
  const label = statusLabel(status);
  // All three tiers show the launch countdown until the presale opens.
  const showCountdown = status === "upcoming" && Boolean(startsAt);

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border bg-surface p-6 transition-all duration-200 hover:-translate-y-1",
        featured ? cn("border-transparent ring-2", v.ring) : "border-border",
        !eligible && "opacity-60",
      )}
    >
      {/* tier-tinted header wash */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b to-transparent opacity-70",
          v.tint,
        )}
      />

      <div className="relative flex items-center justify-between">
        <span className="text-sm font-semibold">
          {v.emoji} {tier.name}
        </span>
        <Badge variant={isOpen ? "accent" : "outline"}>{label}</Badge>
      </div>

      <div className="relative mt-4 flex items-baseline gap-2">
        <span className="font-display text-4xl font-bold tabular-nums text-gold">
          {tokenPrice(tier.price)}
        </span>
        <span className="text-sm text-muted">per $DEGX</span>
      </div>
      <p className="relative mt-1 text-sm text-muted">
        Implied market cap {usd(tier.impliedMarketCap)}
      </p>

      <div className="relative mt-5">
        <div className="flex justify-between text-xs text-muted">
          <span>{usd(raised)} raised</span>
          <span>{usd(tier.raiseTarget)} target</span>
        </div>
        <Progress value={pct} className="mt-2" indicatorClassName={v.bar} />
        <p className="mt-1.5 text-xs text-muted">
          {num(tier.tokensAvailable)} $DEGX · {percent(tier.roiAtGraduation)} at
          graduation
        </p>
      </div>

      <dl className="relative mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted">Min buy</dt>
          <dd className="font-medium">{usd(tier.minBuy)}</dd>
        </div>
        <div>
          <dt className="text-muted">Max / wallet</dt>
          <dd className="font-medium">{usd(tier.maxBuy)}</dd>
        </div>
      </dl>

      <div className="relative mt-6 grow content-end">
        {isOpen && eligible ? (
          <BuyButton tier={tier} className="w-full" />
        ) : (
          <Button className="w-full" variant="secondary" disabled>
            {isOpen
              ? "Not Eligible"
              : status === "upcoming"
                ? "Buy $DEGX"
                : label}
          </Button>
        )}
        {showCountdown && (
          <p className="mt-2 text-center text-sm text-muted">
            Opens in{" "}
            <LaunchCountdown
              target={startsAt}
              className="text-base text-foreground"
            />
          </p>
        )}
        <WalletTierCap tier={tier} />
      </div>
    </div>
  );
}
