import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type { TierId } from "@/types/presale";

/**
 * Drizzle schema for the $DEGX presale (Phase 4 core). Full marketing model
 * (referrals, points_ledger, leaderboard, quests, etc.) is in docs/DATA_MODEL.md
 * and lands in Phase 6. Generate/apply migrations with `pnpm db:generate` /
 * `pnpm db:migrate`.
 */

export const participants = pgTable("participants", {
  wallet: text("wallet").primaryKey(), // base58 pubkey
  referralCode: text("referral_code").unique(),
  referredBy: text("referred_by").references((): AnyPgColumn => participants.wallet),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contributions = pgTable(
  "contributions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    wallet: text("wallet").notNull(),
    tier: smallint("tier").notNull(),
    amountUsdc: numeric("amount_usdc", { precision: 20, scale: 6 }).notNull(),
    // $DEGX the buyer receives at distribution = amount_usdc / tier price. Stored
    // (not just derived) so the row is self-contained for the airdrop and to lock
    // the allocation to the tier at record time. Recomputed if the tier is
    // re-resolved (reconciliation). Nullable for pre-column rows until backfilled.
    degxAllocated: numeric("degx_allocated", { precision: 30, scale: 9 }),
    txSig: text("tx_sig").notNull().unique(), // on-chain signature (idempotency)
    // Degxifi member uid from the access cookie (tiers 1-2) — audit trail for
    // shared-link abuse. Null for public (tier 3) buys.
    memberUid: text("member_uid"),
    status: text("status").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contributions_wallet_idx").on(t.wallet),
    index("contributions_tier_idx").on(t.tier),
    index("contributions_created_idx").on(t.createdAt.desc()),
    // Backs the status-filtered aggregates (SUM raised per tier, flagged list).
    index("contributions_status_tier_idx").on(t.status, t.tier),
    check("contributions_tier_valid", sql`${t.tier} in (1, 2, 3)`),
    check("contributions_amount_positive", sql`${t.amountUsdc} > 0`),
    check("contributions_status_valid", sql`${t.status} in ('pending', 'confirmed')`),
  ],
);

/**
 * Token-distribution ledger — the durable record of what $DEGX has been sent to
 * each wallet (TGE + vesting tranches). One row per recipient.
 *
 * Exactly-once: `distributed` (cumulative confirmed base units) only ever grows,
 * and only after the server verifies the tx on-chain. Before a signed batch is
 * broadcast, its in-flight signature is written here (write-ahead log); on the
 * next load the server reconciles it against the chain — so a wallet is never
 * paid twice and an interrupted run resumes cleanly. All amounts are integer
 * base units (mint smallest unit) as numeric(40,0) — exact, never floats.
 */
export const distributions = pgTable(
  "distributions",
  {
    wallet: text("wallet").primaryKey(), // base58 recipient pubkey
    distributed: numeric("distributed", { precision: 40, scale: 0 })
      .notNull()
      .default("0"),
    inflightAmount: numeric("inflight_amount", { precision: 40, scale: 0 }),
    inflightSig: text("inflight_sig"),
    inflightLvbh: bigint("inflight_lvbh", { mode: "number" }),
    // Permanent on-chain proof: the signature of every confirmed transfer to
    // this wallet, appended at commit time. A wallet accrues one per tranche
    // (TGE, then each vesting unlock). `distributed` is the running total; this
    // is the audit trail of exactly which txs delivered it.
    sigs: text("sigs").array().notNull().default(sql`'{}'::text[]`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("distributions_inflight_sig_idx").on(t.inflightSig)],
);

/** Single-row (id = 1) admin-controlled settings. */
export const appSettings = pgTable("app_settings", {
  id: smallint("id").primaryKey().default(1),
  announcement: text("announcement"),
  degxMint: text("degx_mint"), // $DEGX SPL mint (set by admin after Jupiter launch)
  presaleStart: timestamp("presale_start", { withTimezone: true }),
  tierOverrides: jsonb("tier_overrides")
    .$type<Partial<Record<TierId, "paused" | "closed">>>()
    .default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
