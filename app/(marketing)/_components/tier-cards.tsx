"use client";

import { TIERS } from "@/lib/constants";
import { usePresaleStats } from "@/hooks/use-presale-stats";
import type { TierStatus } from "@/types/presale";
import { TierCard } from "./tier-card";

/**
 * Tier grid with live data from /api/presale/stats (raised + sequential status).
 * Falls back to a safe pre-launch state (zeros, all upcoming) before stats load
 * or when the DB isn't configured. Tier 1 is always the visual focal point.
 */
export function TierCards() {
  const stats = usePresaleStats();

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {TIERS.map((tier, i) => {
        const live = stats?.tiers.find((t) => t.tierId === tier.id);
        const raised = live?.raised ?? 0;
        const status: TierStatus = live?.status ?? "upcoming";
        return (
          <TierCard
            key={tier.id}
            tier={tier}
            raised={raised}
            status={status}
            featured={i === 0}
          />
        );
      })}
    </div>
  );
}
