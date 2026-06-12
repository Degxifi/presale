import { NextResponse } from "next/server";
import {
  computeTierProgress,
  getPresalePhase,
  presaleEndsAt,
  resolvePresaleStart,
} from "@/lib/presale";
import { getRawStats, getSettings } from "@/lib/db/queries";
import { shortWallet } from "@/lib/format";
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
    // Public payload: display-form wallet + truncated sig (the feed only needs
    // a unique key) — don't make the contributor list trivially scrapeable.
    recentBuys: recent.map((r) => ({
      ...r,
      wallet: shortWallet(r.wallet),
      txSig: r.txSig.slice(0, 16),
    })),
  };

  return NextResponse.json(stats, { headers: { "cache-control": "no-store" } });
}
