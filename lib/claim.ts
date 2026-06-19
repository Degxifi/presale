import { degxForUsdc, getTier } from "@/lib/presale";
import type { TierId } from "@/types/presale";

/**
 * $DEGX claim helpers shared by the eligibility API and the claim UI. The owed
 * math MUST match the backend (src/lib/degx/transfer.ts) and the CSV/airdrop:
 * whole $DEGX, floored per confirmed row.
 */

export const CLAIM_DOMAIN = "Degxifi $DEGX Claim";

/**
 * Distribution tranches. A wallet's FULL allocation is released in rounds, one
 * ledger row per (wallet, tranche): tranche 1 = 40% now, tranche 2 = the
 * remaining 60% later. The split is LOSSLESS — tranche 2 = full − tranche 1 —
 * so the two rounds sum to exactly the full allocation. Open the next round by
 * setting CLAIM_TRANCHE=2 in the server env when it's time; until then only
 * tranche 1 is claimable.
 */
export const TRANCHE_PERCENT: Record<number, number> = { 1: 0.4, 2: 0.6 };
export const LAST_TRANCHE = 2;

/** The tranche currently open for claiming (server-side; defaults to 1). */
export function activeTranche(): number {
  const t = Number(process.env.CLAIM_TRANCHE);
  return Number.isInteger(t) && t >= 1 && t <= LAST_TRANCHE ? t : 1;
}

/**
 * Whole $DEGX claimable in a tranche for a full allocation. Tranche 1 floors at
 * 40%; tranche 2 is the exact remainder (full − tranche1) so 40%+60% = full with
 * no rounding loss.
 */
export function claimableForTranche(fullOwed: number, tranche: number): number {
  const t1 = Math.floor(fullOwed * TRANCHE_PERCENT[1]);
  if (tranche === 1) return t1;
  if (tranche === 2) return Math.max(0, fullOwed - t1);
  return 0;
}

/** Whole $DEGX owed for one confirmed contribution row (floored). */
export function owedForRow(tier: TierId, amountUsdc: number): number {
  return Math.floor(degxForUsdc(amountUsdc, getTier(tier).price));
}

/** Σ floor(amount_usdc / tierPrice) over a wallet's confirmed rows. */
export function computeOwedWholeDegx(
  rows: { tier: number; amountUsdc: number | string }[],
): number {
  return rows.reduce(
    (sum, r) => sum + owedForRow(r.tier as TierId, Number(r.amountUsdc)),
    0,
  );
}

/** Aggregate owed whole-$DEGX per wallet across many rows (for the airdrop script). */
export function aggregateOwedByWallet(
  rows: { wallet: string; tier: number; amountUsdc: number | string }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.wallet, (m.get(r.wallet) ?? 0) + owedForRow(r.tier as TierId, Number(r.amountUsdc)));
  }
  return m;
}

/**
 * The canonical message the wallet signs to prove ownership for a claim. The
 * backend re-derives + verifies this exact shape (domain + wallet + freshness).
 */
export function buildClaimMessage(wallet: string, issuedIso: string): string {
  return `${CLAIM_DOMAIN}\nWallet: ${wallet}\nIssued: ${issuedIso}`;
}

export type ClaimStatus = "claimable" | "claimed" | "in_flight" | "not_eligible";

export type Eligibility = {
  owed: number;
  status: ClaimStatus;
  txSig?: string | null;
};
