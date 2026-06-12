"use client";

import { Countdown } from "@/components/marketing/countdown";
import { usePresaleStats } from "@/hooks/use-presale-stats";

/** Countdown to the LAUNCH (all tiers open at once); shows "live" once it passes. */
export function PresaleCountdown() {
  const stats = usePresaleStats();
  return (
    <Countdown
      target={stats?.startsAt ?? null}
      verb="Opens"
      doneLabel="Presale is live"
    />
  );
}
