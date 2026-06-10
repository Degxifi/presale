"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { usd } from "@/lib/format";
import type { Tier } from "@/types/presale";

async function fetchTierRaised(wallet: string, tier: number): Promise<number> {
  try {
    const res = await fetch(`/api/wallet/${wallet}`, { cache: "no-store" });
    if (!res.ok) return 0;
    const data = await res.json();
    return Number(data?.raisedByTier?.[tier] ?? 0);
  } catch {
    return 0;
  }
}

/** Shows the connected wallet's cumulative contribution to a tier (brief §4.3, §6). */
export function WalletTierCap({ tier }: { tier: Tier }) {
  const { publicKey, connected } = useWallet();
  const [contributed, setContributed] = useState<number | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) return;
    let active = true;
    fetchTierRaised(publicKey.toBase58(), tier.id).then((v) => {
      if (active) setContributed(v);
    });
    return () => {
      active = false;
    };
  }, [connected, publicKey, tier.id]);

  if (!connected || contributed === null) return null;

  const full = contributed >= tier.maxBuy - 0.01;
  return (
    <p className={`mt-2 text-center text-xs ${full ? "text-gold" : "text-muted"}`}>
      {full
        ? "Allocation full for this tier"
        : `You've contributed ${usd(contributed)} of ${usd(tier.maxBuy)} max`}
    </p>
  );
}
