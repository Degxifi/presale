/**
 * Domain types for the $DEGX presale. Describe the shape of presale data
 * across UI, lib, and (later) the database/API. Money values are USDC
 * (whole dollars unless noted).
 */

export type TierId = 1 | 2 | 3;

/**
 * Tier lifecycle on the site:
 * - upcoming: not open yet (a previous tier must fill first)
 * - active:   currently accepting contributions
 * - filled:   raise target met, closed
 * - ended:    presale timer expired (regardless of fill)
 */
export type TierStatus =
  | "upcoming"
  | "active"
  | "filled"
  | "ended"
  | "paused" // admin-paused
  | "closed"; // admin-closed

/** Static configuration for a single presale tier (brief §2, §9). */
export interface Tier {
  id: TierId;
  /** Display name, e.g. "Early Believers". */
  name: string;
  /** Short tagline shown under the name. */
  tagline: string;
  /** USDC price per 1 DEGX. */
  price: number;
  /** Market cap implied by this tier's price (price × total supply). */
  impliedMarketCap: number;
  /** DEGX tokens allocated to this tier. */
  tokensAvailable: number;
  /** USDC raise target that must be met before the next tier opens. */
  raiseTarget: number;
  /** Minimum contribution per transaction, USDC. */
  minBuy: number;
  /** Maximum cumulative contribution per wallet, USDC. */
  maxBuy: number;
  /** Estimated participating wallet range (informational). */
  estWallets: { min: number; max: number };
  /** ROI at graduation ($600K MC) as a fraction, e.g. 0.67 = +67%. */
  roiAtGraduation: number;
}

/** A row in the profit-scenarios table (brief §3). */
export interface ProfitScenario {
  /** Target market cap in USDC. */
  marketCap: number;
  /** Implied DEGX price at that market cap. */
  pricePerToken: number;
  /** ROI per tier as a fraction (e.g. 1.78 = +178%). */
  roi: Record<TierId, number>;
}

/** Live progress for a tier, derived from on-chain/db contributions. */
export interface TierProgress {
  tierId: TierId;
  /** USDC raised so far in this tier. */
  raised: number;
  /** USDC target for this tier. */
  target: number;
  /** DEGX still available to buy in this tier. */
  tokensRemaining: number;
  status: TierStatus;
}

/** A confirmed contribution (one on-chain USDC payment). */
export interface Contribution {
  id: string;
  /** Solana wallet (base58). */
  walletAddress: string;
  tierId: TierId;
  /** USDC paid. */
  usdcAmount: number;
  /** DEGX allocated = usdcAmount / tier price. */
  degxAllocated: number;
  /** Solana transaction signature (base58). */
  txSignature: string;
  /** ISO 8601 timestamp of confirmation. */
  createdAt: string;
}

/** Overall presale lifecycle. */
export type PresalePhase = "not-started" | "live" | "ended";

/** Aggregated live presale state served to the client (brief §4.5 dashboard). */
export interface PresaleStats {
  /** Total USDC raised across all tiers. */
  totalRaised: number;
  phase: PresalePhase;
  /** Number of unique contributing wallets. */
  participantCount: number;
  /** Presale start/end (ISO) — admin-set (DB) with env fallback; null if unset. */
  startsAt: string | null;
  endsAt: string | null;
  /** Site-wide announcement banner text, or null when hidden. */
  announcement: string | null;
  tiers: TierProgress[];
  /** Most recent confirmed contributions (for the live feed). */
  recentBuys: {
    wallet: string;
    tier: TierId;
    amount: number;
    txSig: string;
    at: string;
  }[];
}

/** Admin-configurable presale settings (brief §4.5). */
export interface PresaleSettings {
  /** USDC receiving wallet (base58). Null until set by admin. */
  presaleWallet: string | null;
  /** Presale start (ISO 8601). Timer end = start + duration. Null until set. */
  startsAt: string | null;
  /** Per-tier manual override of the automatic status, if any. */
  tierOverrides: Partial<Record<TierId, TierStatus>>;
  /** Optional site-wide banner message; null/empty hides it. */
  announcement: string | null;
}
