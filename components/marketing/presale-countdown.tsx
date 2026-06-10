"use client";

import { Countdown } from "@/components/marketing/countdown";
import { usePresaleStats } from "@/hooks/use-presale-stats";

/** Countdown fed by live stats (admin-set start → end), with env fallback. */
export function PresaleCountdown() {
  const stats = usePresaleStats();
  return <Countdown target={stats?.endsAt ?? null} />;
}
