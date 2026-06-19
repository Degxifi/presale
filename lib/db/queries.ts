import { and, countDistinct, desc, eq, inArray, sql } from "drizzle-orm";
import type { TierId } from "@/types/presale";
import { degxAllocationFloor, degxForUsdc, getTier } from "@/lib/presale";
import { db } from "./index";
import { appSettings, contributions, distributions } from "./schema";
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
  degxMint: string | null;
  presaleStart: string | null;
  tierOverrides: Partial<Record<TierId, "paused" | "closed">>;
};

const zeroByTier = (): Record<TierId, number> => ({ 1: 0, 2: 0, 3: 0 });
const DEFAULT_SETTINGS: AppSettings = {
  announcement: null,
  degxMint: null,
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
    degxMint: row.degxMint ?? null,
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
  if ("degxMint" in patch) set.degxMint = patch.degxMint ?? null;
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

// ---- Token distribution -------------------------------------------------

/**
 * Confirmed allocation per wallet in WHOLE $DEGX tokens — floored per row to
 * match the receipts/CSV, then summed across the wallet's confirmed buys.
 * Flagged/pending rows are excluded (never distributed).
 */
export async function getConfirmedAllocations(): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  if (!db) return out;
  const rows = await db
    .select({
      wallet: contributions.wallet,
      amount: contributions.amountUsdc,
      tier: contributions.tier,
      degx: contributions.degxAllocated,
    })
    .from(contributions)
    .where(eq(contributions.status, "confirmed"));
  for (const r of rows) {
    // Use the allocation locked at record time (the master-list value) — exact
    // and authoritative. Fall back to the exact integer formula only for legacy
    // rows predating the degx_allocated column. Never the float floor, which
    // under-allocates boundary cases (e.g. 180/0.00036).
    const tokens =
      r.degx != null
        ? BigInt(String(r.degx).split(".")[0] || "0")
        : degxAllocationFloor(Number(r.amount), getTier(r.tier as TierId).price);
    if (tokens > 0n) out.set(r.wallet, (out.get(r.wallet) ?? 0n) + tokens);
  }
  return out;
}

export type ImportRow = {
  wallet: string;
  tier: number;
  amountUsdc: string;
  txSig: string;
  status: string;
  memberUid: string | null;
  degxAllocated: string | null;
  createdAt: Date | null;
};

export type ImportApplyResult = {
  total: number; // rows in the file
  inserted: number; // tx_sigs not already present
  updated: number; // tx_sigs already present (overwritten)
  orphans: number; // rows in DB whose tx_sig is NOT in the file
  deleted: number; // orphans actually removed (replace mode only)
  existingBefore: number;
};

/**
 * Load the master contributor list into `contributions`, keyed by tx signature
 * (the on-chain idempotency key). dryRun computes the diff without writing.
 * replace deletes rows whose tx_sig is absent from the file, so the table ends
 * up EXACTLY equal to the file ("use only the csv"). The whole apply is one
 * transaction — it either lands completely or not at all.
 */
export async function importContributions(
  rows: ImportRow[],
  opts: { dryRun: boolean; replace: boolean },
): Promise<ImportApplyResult> {
  if (!db) throw new Error("Database is not configured.");
  const database = db;
  const fileSigs = new Set(rows.map((r) => r.txSig));

  const existing = await database.select({ txSig: contributions.txSig }).from(contributions);
  const existingSigs = new Set(existing.map((e) => e.txSig));
  const inserted = rows.filter((r) => !existingSigs.has(r.txSig)).length;
  const updated = rows.length - inserted;
  const orphanSigs = [...existingSigs].filter((s) => !fileSigs.has(s));

  const result: ImportApplyResult = {
    total: rows.length,
    inserted,
    updated,
    orphans: orphanSigs.length,
    deleted: opts.replace ? orphanSigs.length : 0,
    existingBefore: existingSigs.size,
  };
  if (opts.dryRun) return result;

  await database.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({
        wallet: r.wallet,
        tier: r.tier,
        amountUsdc: r.amountUsdc,
        txSig: r.txSig,
        status: r.status,
        memberUid: r.memberUid,
        degxAllocated: r.degxAllocated,
        ...(r.createdAt ? { createdAt: r.createdAt } : {}),
      }));
      await tx
        .insert(contributions)
        .values(chunk)
        .onConflictDoUpdate({
          target: contributions.txSig,
          set: {
            wallet: sql`excluded.wallet`,
            tier: sql`excluded.tier`,
            amountUsdc: sql`excluded.amount_usdc`,
            status: sql`excluded.status`,
            memberUid: sql`excluded.member_uid`,
            degxAllocated: sql`excluded.degx_allocated`,
          },
        });
    }
    if (opts.replace && orphanSigs.length) {
      for (let i = 0; i < orphanSigs.length; i += 500) {
        await tx.delete(contributions).where(inArray(contributions.txSig, orphanSigs.slice(i, i + 500)));
      }
    }
  });

  return result;
}

export type DistributionRow = {
  wallet: string;
  distributed: string; // base units
  inflightAmount: string | null;
  inflightSig: string | null;
  inflightLvbh: number | null;
};

/** Ledger state per wallet (cumulative distributed + any in-flight WAL entry). */
export async function getDistributionRows(): Promise<DistributionRow[]> {
  if (!db) return [];
  const rows = await db.select().from(distributions);
  return rows.map((r) => ({
    wallet: r.wallet,
    distributed: r.distributed,
    inflightAmount: r.inflightAmount,
    inflightSig: r.inflightSig,
    inflightLvbh: r.inflightLvbh,
  }));
}

/**
 * Write-ahead log: record signed-but-not-yet-confirmed transfers BEFORE they're
 * broadcast. The caller (route) must ensure none of these wallets already has an
 * in-flight entry (reconcile/reload first), so a live signature is never
 * orphaned by an overwrite.
 */
export async function setInflight(
  items: { wallet: string; amount: string; sig: string; lvbh: number; target: string }[],
): Promise<void> {
  if (!db) throw new Error("Database is not configured.");
  const database = db;
  // One transaction for the whole wave: every wallet must claim its slot or the
  // wave rolls back (so the caller never broadcasts a partially-recorded wave).
  await database.transaction(async (tx) => {
    for (const it of items) {
      // Atomic claim. The DO UPDATE only fires when the wallet has NO live
      // in-flight entry AND the new running total stays within its unlock
      // target. Two concurrent runs therefore cannot both win the same row —
      // the loser's update matches zero rows and we abort the wave. This is what
      // makes "no wallet is ever paid twice" true under concurrency, not just
      // for a single sequential run.
      const res = await tx
        .insert(distributions)
        .values({
          wallet: it.wallet,
          distributed: "0",
          inflightAmount: it.amount,
          inflightSig: it.sig,
          inflightLvbh: it.lvbh,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: distributions.wallet,
          set: {
            inflightAmount: it.amount,
            inflightSig: it.sig,
            inflightLvbh: it.lvbh,
            updatedAt: new Date(),
          },
          setWhere: sql`${distributions.inflightSig} is null and ${distributions.distributed} + ${it.amount}::numeric <= ${it.target}::numeric`,
        })
        .returning({ wallet: distributions.wallet });
      if (res.length === 0)
        throw new Error(
          `${it.wallet} is already in-flight or over its unlock target — reload the plan and retry.`,
        );
    }
  });
}

/** Commit confirmed batches: distributed += in-flight amount, then clear it. */
export async function commitConfirmed(sigs: string[]): Promise<void> {
  if (!db || sigs.length === 0) return;
  // Credit the tranche AND append the on-chain signature to the wallet's proof
  // list, in one row update. The WHERE (inflight_sig still set) makes it
  // idempotent: a duplicate or concurrent commit matches zero rows, so a sig is
  // never double-credited or double-appended.
  await db
    .update(distributions)
    .set({
      distributed: sql`${distributions.distributed} + coalesce(${distributions.inflightAmount}, 0)`,
      sigs: sql`array_append(${distributions.sigs}, ${distributions.inflightSig})`,
      inflightAmount: null,
      inflightSig: null,
      inflightLvbh: null,
      updatedAt: new Date(),
    })
    .where(inArray(distributions.inflightSig, sigs));
}

/** Clear in-flight entries (expired/failed) so those wallets are owed again. */
export async function clearInflight(sigs: string[]): Promise<void> {
  if (!db || sigs.length === 0) return;
  await db
    .update(distributions)
    .set({
      inflightAmount: null,
      inflightSig: null,
      inflightLvbh: null,
      updatedAt: new Date(),
    })
    .where(inArray(distributions.inflightSig, sigs));
}
