"use client";

import { Countdown } from "@/components/marketing/countdown";
import { usePresaleStats } from "@/hooks/use-presale-stats";

/**
 * Phase-aware hero countdown. Pre-launch it counts down to the LAUNCH (all
 * tiers open at once); once the stats poll reports the presale is live it
 * counts down to the END, and after that it shows "Presale ended" — it never
 * claims "live" past the end.
 */
export function PresaleCountdown() {
  const stats = usePresaleStats();

  // Live or ended → target the END (Countdown's done state = "Presale ended").
  if (stats && stats.phase !== "not-started") {
    return (
      <Countdown target={stats.endsAt} verb="Ends" doneLabel="Presale ended" />
    );
  }

  // Pre-launch (or stats not loaded yet) → target the LAUNCH.
  return (
    <Countdown
      target={stats?.startsAt ?? null}
      verb="Opens"
      doneLabel="Presale is live"
    />
  );
}
