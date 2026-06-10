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
    txSig: text("tx_sig").notNull().unique(), // on-chain signature (idempotency)
    status: text("status").notNull().default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contributions_wallet_idx").on(t.wallet),
    index("contributions_tier_idx").on(t.tier),
    index("contributions_created_idx").on(t.createdAt.desc()),
    check("contributions_tier_valid", sql`${t.tier} in (1, 2, 3)`),
    check("contributions_amount_positive", sql`${t.amountUsdc} > 0`),
    check("contributions_status_valid", sql`${t.status} in ('pending', 'confirmed')`),
  ],
);

/** Single-row (id = 1) admin-controlled settings. */
export const appSettings = pgTable("app_settings", {
  id: smallint("id").primaryKey().default(1),
  announcement: text("announcement"),
  presaleStart: timestamp("presale_start", { withTimezone: true }),
  tierOverrides: jsonb("tier_overrides")
    .$type<Partial<Record<TierId, "paused" | "closed">>>()
    .default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
