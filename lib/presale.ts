import { PRESALE, TIERS, TOKEN } from "@/lib/constants";
import type {
  PresalePhase,
  Tier,
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

/**
 * Exact floored $DEGX allocation (whole tokens) for a contribution, via integer
 * math. Float division dips below integers at boundaries — e.g. 180 / 0.00036 is
 * exactly 500000, but IEEE-754 yields 499999.9999…, so Math.floor() would
 * under-allocate by a token. Scaling both operands to integers (×1e6) and using
 * BigInt division floors correctly. Used by the distribution + the import guard.
 */
export function degxAllocationFloor(usdcAmount: number, tierPrice: number): bigint {
  const usdcE6 = BigInt(Math.round(usdcAmount * 1e6));
  const priceE6 = BigInt(Math.round(tierPrice * 1e6));
  return priceE6 > 0n ? usdcE6 / priceE6 : 0n;
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

/**
 * Max USDC a tier can take before its FIXED $DEGX allocation is exhausted
 * (tokensAvailable × price). The hard ceiling for distribution: accepting more
 * than this would promise more $DEGX than the tier's pool holds. Enforced
 * server-side in the contribution path (overflow is flagged for review).
 */
export function tierUsdcCeiling(
  tier: Pick<Tier, "tokensAvailable" | "price">,
): number {
  return tier.tokensAvailable * tier.price;
}

/**
 * Whether a visitor with the given access tier may buy a presale tier
 * (CUMULATIVE access): Early Believers (1) → tier-1 members (D-VIP/D-Pro 3-6)
 * only; Early Supporters (2) → any member (tier 1 or 2); Public (3) → everyone,
 * including non-members (accessTier null). Single source of truth shared by the
 * card UI, the buy dialog, and the server route so they can't drift.
 */
export function isTierEligible(
  tierId: TierId,
  accessTier: 1 | 2 | null | undefined,
): boolean {
  if (tierId === 3) return true;
  if (tierId === 2) return accessTier === 1 || accessTier === 2;
  return accessTier === 1;
}

/**
 * Built-in launch instant (Sat 2026-06-13 10:00 WAT) — matches the Degxifi app
 * banner. Used as the final fallback so the presale launches on schedule even if
 * the env var / admin setting is never configured.
 */
export const PRESALE_START_DEFAULT = "2026-06-13T10:00:00+01:00";

/**
 * Resolve the presale start ISO: admin DB setting → NEXT_PUBLIC_PRESALE_START →
 * built-in default. Always returns a value (never null), so the timer/phase are
 * guaranteed; the admin can still override the date from the dashboard.
 * Malformed/whitespace candidates are skipped (never returned), so callers can
 * safely `new Date(...)` the result.
 */
export function resolvePresaleStart(dbStart: string | null | undefined): string {
  for (const candidate of [dbStart, process.env.NEXT_PUBLIC_PRESALE_START]) {
    const v = candidate?.trim();
    if (v && !Number.isNaN(new Date(v).getTime())) return v;
  }
  return PRESALE_START_DEFAULT;
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
 * Derive per-tier progress + status from raised amounts. All tiers open
 * SIMULTANEOUSLY at launch; eligibility (isTierEligible) decides who can buy
 * each. A tier auto-Sells-Out ("filled") once its raised reaches the target.
 *
 * `applyBoost` adds each tier's display-only `raisedBoost` to the figure — set
 * it ONLY on the public stats path (so the cards/counter show the boosted
 * momentum number and sell out at the SHOWN target). Leave it false for the
 * admin view and the contribution route, which must work off REAL raised. Pure
 * — no time access (caller supplies the phase).
 */
export function computeTierProgress(
  raisedByTier: Record<TierId, number>,
  phase: PresalePhase,
  overrides: Partial<Record<TierId, "paused" | "closed">> = {},
  applyBoost = false,
): TierProgress[] {
  return TIERS.map((tier) => {
    const boosted =
      (raisedByTier[tier.id] ?? 0) +
      (applyBoost ? (tier as Tier).raisedBoost ?? 0 : 0);

    let status: TierStatus;
    if (phase === "ended") {
      status = "ended";
    } else if (phase === "live") {
      // Fill-based auto Sold Out: once raised reaches the target, stop showing
      // it as open. Time-based "active" otherwise.
      status = boosted >= tier.raiseTarget ? "filled" : "active";
    } else {
      status = "upcoming";
    }

    // Admin override takes precedence (pause/close a tier).
    const override = overrides[tier.id];
    if (override === "closed") status = "closed";
    else if (override === "paused") status = "paused";

    // On the boosted (public) path, never DISPLAY past the target, so a filled
    // tier reads as exactly "$target / $target" with a full bar instead of
    // overshooting as real buys trickle in past the boost. The status decision
    // above still uses the true boosted figure.
    const raised = applyBoost ? Math.min(boosted, tier.raiseTarget) : boosted;

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
