import { NextResponse } from "next/server";
import { TIERS } from "@/lib/constants";
import {
  computeTierProgress,
  getPresalePhase,
  presaleEndsAt,
  resolvePresaleStart,
} from "@/lib/presale";
import {
  getRawStats,
  getSettings,
  type AppSettings,
  type RawStats,
} from "@/lib/db/queries";
import { shortWallet } from "@/lib/format";
import type { PresaleStats, Tier } from "@/types/presale";

export const dynamic = "force-dynamic"; // always live

/**
 * In-memory snapshot of the EXPENSIVE DB reads (raised totals, participant
 * count, recent buys, settings), refreshed at most once per CACHE_TTL_MS no
 * matter how many clients poll. Single-flight + stale-while-revalidate means
 * concurrent polls never stampede the DB and never block on it after the first
 * load — so 100k browsers polling every ~12s become ~1 DB read / 10s, not
 * thousands of aggregations per second.
 *
 * The TIME-dependent parts (phase, per-tier status) are recomputed FRESH on
 * every request from `startsAt` + the clock, so the launch still flips tiers
 * to "active" exactly on schedule with no cache lag.
 */
const CACHE_TTL_MS = 10_000;
type Snapshot = { raw: RawStats; settings: AppSettings };
let snapshot: Snapshot | null = null;
let snapshotAt = 0;
let inflight: Promise<void> | null = null;

function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = Promise.all([getRawStats(), getSettings()])
    .then(([raw, settings]) => {
      snapshot = { raw, settings };
      snapshotAt = Date.now();
    })
    .catch(() => {}) // keep the last good snapshot through a transient DB blip
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function getSnapshot(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshotAt < CACHE_TTL_MS) return snapshot;
  if (snapshot) {
    void refresh(); // stale → serve immediately, revalidate in the background
    return snapshot;
  }
  await refresh(); // cold start → the first caller waits
  return (
    snapshot ?? {
      raw: { raisedByTier: { 1: 0, 2: 0, 3: 0 }, participantCount: 0, recent: [] },
      settings: { announcement: null, presaleStart: null, tierOverrides: {} },
    }
  );
}

export async function GET() {
  const {
    raw: { raisedByTier, participantCount, recent },
    settings,
  } = await getSnapshot();

  // Admin DB start wins, then env, then the built-in default launch instant.
  const startsAt = resolvePresaleStart(settings.presaleStart);
  const phase = getPresalePhase(startsAt);
  const endsAt = presaleEndsAt(new Date(startsAt)).toISOString();

  // PUBLIC display only: while live, add each tier's display baseline so the
  // cards + total counter show the boosted momentum figure and a tier auto-Sells-
  // Out when its SHOWN total hits the target. Real raised (and recorded
  // contributions) are untouched — admin + the contribution route use real.
  const applyBoost = phase === "live";
  const boostSum = applyBoost
    ? TIERS.reduce((s, t) => s + ((t as Tier).raisedBoost ?? 0), 0)
    : 0;

  const stats: PresaleStats = {
    totalRaised:
      raisedByTier[1] + raisedByTier[2] + raisedByTier[3] + boostSum,
    phase,
    participantCount,
    startsAt,
    endsAt,
    announcement: settings.announcement,
    tiers: computeTierProgress(raisedByTier, phase, settings.tierOverrides, applyBoost),
    // Public payload: display-form wallet + truncated sig (the feed only needs
    // a unique key) — don't make the contributor list trivially scrapeable.
    recentBuys: recent.map((r) => ({
      ...r,
      wallet: shortWallet(r.wallet),
      txSig: r.txSig.slice(0, 16),
    })),
  };

  return NextResponse.json(stats, {
    headers: {
      // Shared caches (Cloudflare) hold for 10s and serve stale up to 30s while
      // revalidating; browsers always revalidate (max-age=0). Layered with the
      // in-memory snapshot, the DB is hit at most ~once / 10s per instance.
      "cache-control": "public, max-age=0, s-maxage=10, stale-while-revalidate=30",
    },
  });
}
