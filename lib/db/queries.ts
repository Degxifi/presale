import { and, countDistinct, desc, eq } from "drizzle-orm";
import type { TierId } from "@/types/presale";
import { db } from "./index";
import { appSettings, contributions } from "./schema";

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

/** Insert a confirmed contribution. Idempotent on tx_sig (re-submits are no-ops). */
export async function recordContribution(input: {
  wallet: string;
  tier: TierId;
  amount: number;
  txSig: string;
}): Promise<void> {
  if (!db) throw new Error("Database is not configured.");
  try {
    await db.insert(contributions).values({
      wallet: input.wallet,
      tier: input.tier,
      amountUsdc: String(input.amount), // numeric column takes a string
      txSig: input.txSig,
      status: "confirmed",
    });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (msg.includes("duplicate key") || msg.includes("unique")) return;
    throw e;
  }
}

/** Raised-per-tier, participant count, and recent buys. Empty when unconfigured. */
export async function getRawStats(): Promise<RawStats> {
  if (!db) return { raisedByTier: zeroByTier(), participantCount: 0, recent: [] };

  const rows = await db
    .select({ tier: contributions.tier, amount: contributions.amountUsdc })
    .from(contributions)
    .where(eq(contributions.status, "confirmed"));
  const raisedByTier = zeroByTier();
  for (const r of rows) raisedByTier[r.tier as TierId] += Number(r.amount);

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
    .select({ tier: contributions.tier, amount: contributions.amountUsdc })
    .from(contributions)
    .where(
      and(eq(contributions.wallet, wallet), eq(contributions.status, "confirmed")),
    );
  for (const r of rows) result[r.tier as TierId] += Number(r.amount);
  return result;
}

/** All confirmed contributions (admin CSV export), oldest first. */
export async function getAllContributions() {
  if (!db) return [];
  return db
    .select()
    .from(contributions)
    .where(eq(contributions.status, "confirmed"))
    .orderBy(contributions.createdAt);
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
