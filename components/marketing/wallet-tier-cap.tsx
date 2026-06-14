"use client";

import { useWalletRaised } from "@/components/presale/wallet-raised-context";
import { usd } from "@/lib/format";
import type { Tier } from "@/types/presale";

/**
 * Shows the connected wallet's cumulative contribution to a tier (brief §4.3,
 * §6). Reads the shared {@link useWalletRaised} state so all three cards share a
 * single fetch and refresh together after a buy.
 *
 * Crucially, it NEVER renders a fabricated "$0.00": a failed/rate-limited load
 * shows a retry affordance, not a false zero. Only a confirmed-ready value of 0
 * (the wallet genuinely hasn't contributed) shows "$0.00".
 */
export function WalletTierCap({ tier }: { tier: Tier }) {
  const { status, get, refresh } = useWalletRaised();

  // No wallet connected, or the first load is still in flight — show nothing
  // (matches the prior behavior of rendering only once a value is known).
  if (status === "idle" || status === "loading") return null;

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={refresh}
        className="mt-2 w-full text-center text-xs text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        Couldn&apos;t load your contribution — tap to retry
      </button>
    );
  }

  // status === "ready": an authoritative value from the server (0 is a real 0).
  const contributed = get(tier.id);
  const full = contributed >= tier.maxBuy - 0.01;
  return (
    <p className={`mt-2 text-center text-xs ${full ? "text-gold" : "text-muted"}`}>
      {full
        ? "Allocation full for this tier"
        : `You've contributed ${usd(contributed)} of ${usd(tier.maxBuy)} max`}
    </p>
  );
}
