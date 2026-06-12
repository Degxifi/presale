"use client";

import { TIERS } from "@/lib/constants";
import { usePresaleStats } from "@/hooks/use-presale-stats";
import { isTierEligible } from "@/lib/presale";
import type { TierStatus } from "@/types/presale";
import { TierCard } from "./tier-card";

/**
 * Tier grid with live data from /api/presale/stats (raised + sequential status).
 * Falls back to a safe pre-launch state (zeros, all upcoming) before stats load
 * or when the DB isn't configured. The featured ring goes to the best tier the
 * visitor can actually buy (cumulative access via `accessTier` from the access
 * cookie): tier-1 members → Early Believers, other members → Early Supporters,
 * everyone else → Public.
 */
export function TierCards({ accessTier = null }: { accessTier?: 1 | 2 | null }) {
  const stats = usePresaleStats();
  const featuredId = TIERS.find((t) => isTierEligible(t.id, accessTier))?.id;

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {TIERS.map((tier) => {
        const live = stats?.tiers.find((t) => t.tierId === tier.id);
        const raised = live?.raised ?? 0;
        const status: TierStatus = live?.status ?? "upcoming";
        return (
          <TierCard
            key={tier.id}
            tier={tier}
            raised={raised}
            status={status}
            featured={tier.id === featuredId}
            accessTier={accessTier}
            startsAt={stats?.startsAt ?? null}
          />
        );
      })}
    </div>
  );
}
