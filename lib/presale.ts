import { PRESALE, TIERS, TOKEN } from "@/lib/constants";
import type {
  PresalePhase,
  TierId,
  TierProgress,
  TierStatus,
} from "@/types/presale";

/**
 * Pure presale calculations. Keep all monetary/allocation math here so it's
 * testable and consistent across the UI (brief §6 "Token allocation calc").
 */

/** DEGX received for a USDC amount at a given tier price. */
export function degxForUsdc(usdcAmount: number, tierPrice: number): number {
  return usdcAmount / tierPrice;
}

/** Token price implied by a target market cap (FDV basis = total supply). */
export function priceAtMarketCap(marketCap: number): number {
  return marketCap / TOKEN.totalSupply;
}

/**
 * ROI (fraction) for a tier price if the token reaches a market cap.
 * e.g. roiAtMarketCap(0.00036, 1_000_000) → ~1.78 (+178%).
 * NOTE: always present ROI to users as CONDITIONAL on reaching the MC,
 * never as a guarantee (see compliance rules).
 */
export function roiAtMarketCap(tierPrice: number, marketCap: number): number {
  return priceAtMarketCap(marketCap) / tierPrice - 1;
}

/** Look up a tier by id (throws on unknown id). */
export function getTier(id: TierId) {
  const tier = TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown tier: ${id}`);
  return tier;
}

/** Presale end = start + duration (default 7 days). */
export function presaleEndsAt(
  startsAt: Date,
  durationDays: number = PRESALE.durationDays,
): Date {
  return new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

/** Presale phase from a start ISO (server-only use — reads the clock). */
export function getPresalePhase(
  startIso: string | null,
  durationDays: number = PRESALE.durationDays,
): PresalePhase {
  if (!startIso) return "not-started";
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return "not-started";
  const now = Date.now();
  if (now < start) return "not-started";
  return now >= start + durationDays * 24 * 60 * 60 * 1000 ? "ended" : "live";
}

/**
 * Derive per-tier progress + status from raised amounts. Tiers fill
 * sequentially, so the active tier is the first non-filled tier (only when the
 * presale is live). Pure — no time access (caller supplies the phase).
 */
export function computeTierProgress(
  raisedByTier: Record<TierId, number>,
  phase: PresalePhase,
  overrides: Partial<Record<TierId, "paused" | "closed">> = {},
): TierProgress[] {
  let activeAssigned = false;
  return TIERS.map((tier) => {
    const raised = raisedByTier[tier.id] ?? 0;
    const filled = raised >= tier.raiseTarget;

    let status: TierStatus;
    if (phase === "ended") {
      status = filled ? "filled" : "ended";
    } else if (filled) {
      status = "filled";
    } else if (phase === "live" && !activeAssigned) {
      status = "active";
      activeAssigned = true;
    } else {
      status = "upcoming";
    }

    // Admin override takes precedence (pause/close a tier).
    const override = overrides[tier.id];
    if (override === "closed") status = "closed";
    else if (override === "paused") status = "paused";

    const soldTokens =
      tier.price > 0 ? Math.min(raised / tier.price, tier.tokensAvailable) : 0;
    return {
      tierId: tier.id,
      raised,
      target: tier.raiseTarget,
      tokensRemaining: Math.max(0, tier.tokensAvailable - soldTokens),
      status,
    };
  });
}
