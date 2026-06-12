import { NextResponse } from "next/server";
import {
  computeTierProgress,
  getPresalePhase,
  presaleEndsAt,
  resolvePresaleStart,
} from "@/lib/presale";
import { getRawStats, getSettings } from "@/lib/db/queries";
import type { PresaleStats } from "@/types/presale";

export const dynamic = "force-dynamic"; // always live

export async function GET() {
  const [{ raisedByTier, participantCount, recent }, settings] = await Promise.all([
    getRawStats(),
    getSettings(),
  ]);

  // Admin DB start wins, then env, then the built-in default launch instant.
  const startsAt = resolvePresaleStart(settings.presaleStart);
  const phase = getPresalePhase(startsAt);
  const endsAt = presaleEndsAt(new Date(startsAt)).toISOString();

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
