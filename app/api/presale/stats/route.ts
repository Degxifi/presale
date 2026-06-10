import { NextResponse } from "next/server";
import { computeTierProgress, getPresalePhase, presaleEndsAt } from "@/lib/presale";
import { getRawStats, getSettings } from "@/lib/db/queries";
import type { PresaleStats } from "@/types/presale";

export const dynamic = "force-dynamic"; // always live

export async function GET() {
  const [{ raisedByTier, participantCount, recent }, settings] = await Promise.all([
    getRawStats(),
    getSettings(),
  ]);

  // Admin-set start (DB) wins over the env fallback.
  const startsAt =
    settings.presaleStart ?? process.env.NEXT_PUBLIC_PRESALE_START ?? null;
  const phase = getPresalePhase(startsAt);
  const endsAt = startsAt
    ? presaleEndsAt(new Date(startsAt)).toISOString()
    : null;

  const stats: PresaleStats = {
    totalRaised: raisedByTier[1] + raisedByTier[2] + raisedByTier[3],
    phase,
    participantCount,
    startsAt,
    endsAt,
    announcement: settings.announcement,
    tiers: computeTierProgress(raisedByTier, phase, settings.tierOverrides),
    recentBuys: recent,
  };

  return NextResponse.json(stats, { headers: { "cache-control": "no-store" } });
}
