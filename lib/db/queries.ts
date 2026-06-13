import { and, countDistinct, desc, eq, sql } from "drizzle-orm";
import type { TierId } from "@/types/presale";
import { degxForUsdc, getTier } from "@/lib/presale";
import { db } from "./index";
import { appSettings, contributions } from "./schema";
import { user as authUser } from "./auth-schema";

export type RecentBuy = {
  wallet: string;
  tier: TierId;
  amount: number;
  txSig: string;
  at: string;
};

export type RawStats = {
  raisedByTier: Record<TierId, number>;
  participantCount: number;
  recent: RecentBuy[];
};

export type AppSettings = {
  announcement: string | null;
  presaleStart: string | null;
  tierOverrides: Partial<Record<TierId, "paused" | "closed">>;
};

const zeroByTier = (): Record<TierId, number> => ({ 1: 0, 2: 0, 3: 0 });
const DEFAULT_SETTINGS: AppSettings = {
  announcement: null,
  presaleStart: null,
  tierOverrides: {},
};

export type RecordReason = "below_min" | "over_cap" | "over_tier";
export type RecordResult = {
  /** false when the tx_sig already existed (idempotent re-submit). */
  recorded: boolean;
  /** Stored status of the row after this call. */
  status: "confirmed" | "pending";
  /** Why the row was flagged 'pending', if it was. */
  reason: RecordReason | null;
};

/**
 * Record a verified on-chain contribution and decide its status ATOMICALLY.
 *
 * Invariant: a payment that has already moved on-chain is NEVER dropped — every
 * verified tx produces a durable row. Rows that can't be counted yet (below the
 * tier minimum, over the per-wallet cap, or past the tier's token allocation)
 * are stored as 'pending' (excluded from totals/caps) and surfaced to admins
 * for manual review — instead of being rejected or silently lost.
 *
 * Concurrency: a transaction-scoped advisory lock keyed on the WALLET serializes
 * all of that wallet's buys, so the read-then-write cap decision is race-free
 * (no more "two concurrent buys both demoted" or "both slip past the cap"). The
 * lock is pg_advisory_xact_lock — released at COMMIT, so it is safe under the
 * Supabase transaction pooler. Idempotent on tx_sig: a re-submit (even under a
 * different tier) finds the existing row and is a no-op, so it can't retarget
 * the cap check at the wrong tier.
 *
 * The per-TIER ceiling check (token-allocation cap) is best-effort: it is NOT
 * serialized across wallets (that would serialize the whole tier and kill launch
 * throughput), so a small number of buys may cross the boundary before it trips.
 * It reliably prevents gross oversell (a tier raising well past its allocation).
 */
export async function recordContributionWithCap(input: {
  wallet: string;
  tier: TierId;
  amount: number;
  txSig: string;
  memberUid?: string | null;
  minBuy: number;
  maxBuy: number;
  tierCeiling: number;
}): Promise<RecordResult> {
  if (!db) throw new Error("Database is not configured.");
  const { wallet, tier, amount, txSig, minBuy, maxBuy, tierCeiling } = input;

  return db.transaction(async (tx) => {
    // Serialize this WALLET's buys so the per-wallet cap + idempotency decision
    // can't race. Deliberately NOT a per-tier lock: that would make the tier
    // ceiling a hard stop but serialize ALL buys to a tier, and lock-waiters
    // hold a pooled DB connection while blocked → connection-pool exhaustion
    // under a launch spike (a far worse failure than a small boundary
    // over-allocation). So the per-tier ceiling below stays best-effort.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${wallet})::bigint)`);

    // Idempotency: if this tx is already recorded, return its CURRENT state and
    // do nothing (never re-flag an existing row against a different tier).
    const [existing] = await tx
      .select({ status: contributions.status })
      .from(contributions)
      .where(eq(contributions.txSig, txSig))
      .limit(1);
    if (existing) {
      return {
        recorded: false,
        status: existing.status === "confirmed" ? "confirmed" : "pending",
        reason: null,
      };
    }

    // Decide the status of this NEW row from race-free sums taken under the lock.
    let status: "confirmed" | "pending" = "confirmed";
    let reason: RecordReason | null = null;

    if (amount < minBuy - 0.01) {
      status = "pending";
      reason = "below_min";
    } else {
      const [w] = await tx
        .select({
          total: sql<string>`coalesce(sum(${contributions.amountUsdc}), 0)`,
        })
        .from(contributions)
        .where(
          and(
            eq(contributions.wallet, wallet),
            eq(contributions.tier, tier),
            eq(contributions.status, "confirmed"),
          ),
        );
      if (Number(w?.total ?? 0) + amount > maxBuy + 0.01) {
        status = "pending";
        reason = "over_cap";
      } else {
        const [t] = await tx
          .select({
            total: sql<string>`coalesce(sum(${contributions.amountUsdc}), 0)`,
          })
          .from(contributions)
          .where(
            and(
              eq(contributions.tier, tier),
              eq(contributions.status, "confirmed"),
            ),
          );
        if (Number(t?.total ?? 0) + amount > tierCeiling + 0.01) {
          status = "pending";
          reason = "over_tier";
        }
      }
    }

    await tx.insert(contributions).values({
      wallet,
      tier,
      amountUsdc: String(amount), // numeric column takes a string
      degxAllocated: String(degxForUsdc(amount, getTier(tier).price)),
      txSig,
      memberUid: input.memberUid ?? null,
      status,
    });

    return { recorded: true, status, reason };
  });
}

/**
 * Raised USDC per tier from CONFIRMED rows, via a SQL aggregate (SUM grouped by
 * tier) — not a full-table fetch summed in JS, so cost stays flat as the table
 * grows. This is the lightweight read used on the hot contribution write path.
 */
export async function getRaisedByTier(): Promise<Record<TierId, number>> {
  const raisedByTier = zeroByTier();
  if (!db) return raisedByTier;
  const rows = await db
    .select({
      tier: contributions.tier,
      total: sql<string>`sum(${contributions.amountUsdc})`,
    })
    .from(contributions)
    .where(eq(contributions.status, "confirmed"))
    .groupBy(contributions.tier);
  for (const r of rows) raisedByTier[r.tier as TierId] = Number(r.total ?? 0);
  return raisedByTier;
}

/** Raised-per-tier, participant count, and recent buys. Empty when unconfigured. */
export async function getRawStats(): Promise<RawStats> {
  if (!db) return { raisedByTier: zeroByTier(), participantCount: 0, recent: [] };

  const raisedByTier = await getRaisedByTier();

  const [{ count } = { count: 0 }] = await db
    .select({ count: countDistinct(contributions.wallet) })
    .from(contributions)
    .where(eq(contributions.status, "confirmed"));

  const recentRows = await db
    .select({
      wallet: contributions.wallet,
      tier: contributions.tier,
      amount: contributions.amountUsdc,
      txSig: contributions.txSig,
      createdAt: contributions.createdAt,
    })
    .from(contributions)
    .where(eq(contributions.status, "confirmed"))
    .orderBy(desc(contributions.createdAt))
    .limit(12);
  const recent: RecentBuy[] = recentRows.map((r) => ({
    wallet: r.wallet,
    tier: r.tier as TierId,
    amount: Number(r.amount),
    txSig: r.txSig,
    at: r.createdAt.toISOString(),
  }));

  return { raisedByTier, participantCount: Number(count), recent };
}

/** A single wallet's confirmed raised amount per tier (for cap enforcement). */
export async function getWalletRaisedByTier(
  wallet: string,
): Promise<Record<TierId, number>> {
  const result = zeroByTier();
  if (!db) return result;
  const rows = await db
    .select({
      tier: contributions.tier,
      total: sql<string>`sum(${contributions.amountUsdc})`,
    })
    .from(contributions)
    .where(
      and(eq(contributions.wallet, wallet), eq(contributions.status, "confirmed")),
    )
    .groupBy(contributions.tier);
  for (const r of rows) result[r.tier as TierId] = Number(r.total ?? 0);
  return result;
}

/** All confirmed contributions (admin CSV export / distribution), oldest first. */
export async function getAllContributions() {
  if (!db) return [];
  return db
    .select()
    .from(contributions)
    .where(eq(contributions.status, "confirmed"))
    .orderBy(contributions.createdAt);
}

/**
 * Contributions flagged for manual review (status='pending'): below-min,
 * over-cap, or over-tier-allocation payments whose USDC HAS moved on-chain but
 * is intentionally excluded from totals/caps until an admin reconciles it. These
 * would otherwise be invisible everywhere, so the admin dashboard surfaces them.
 */
export async function getFlaggedContributions() {
  if (!db) return [];
  return db
    .select()
    .from(contributions)
    .where(eq(contributions.status, "pending"))
    .orderBy(desc(contributions.createdAt));
}

/** Admin-controlled settings (single row). Defaults when unconfigured. */
export async function getSettings(): Promise<AppSettings> {
  if (!db) return DEFAULT_SETTINGS;
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  if (!row) return DEFAULT_SETTINGS;
  return {
    announcement: row.announcement ?? null,
    presaleStart: row.presaleStart ? row.presaleStart.toISOString() : null,
    tierOverrides: row.tierOverrides ?? {},
  };
}

/** Upsert admin settings (only provided fields are changed). */
export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<void> {
  if (!db) throw new Error("Database is not configured.");
  const set: Partial<typeof appSettings.$inferInsert> = { updatedAt: new Date() };
  if ("announcement" in patch) set.announcement = patch.announcement ?? null;
  if ("presaleStart" in patch) {
    set.presaleStart = patch.presaleStart ? new Date(patch.presaleStart) : null;
  }
  if ("tierOverrides" in patch) set.tierOverrides = patch.tierOverrides ?? {};
  await db
    .insert(appSettings)
    .values({ id: 1, ...set })
    .onConflictDoUpdate({ target: appSettings.id, set });
}

// ---- Admin users (roles) ------------------------------------------------

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

/** All auth users with their roles (admin management). */
export async function listUsers(): Promise<AdminUser[]> {
  if (!db) return [];
  const rows = await db
    .select({
      id: authUser.id,
      email: authUser.email,
      role: authUser.role,
      createdAt: authUser.createdAt,
    })
    .from(authUser)
    .orderBy(authUser.createdAt);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role ?? "user",
    createdAt: r.createdAt.toISOString(),
  }));
}
