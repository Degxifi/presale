import type { ProfitScenario, Tier } from "@/types/presale";

/**
 * SINGLE SOURCE OF TRUTH for all $DEGX presale numbers (brief §1–§3, §9).
 * UI, calculations, and docs read from here — never hardcode tier values
 * in components.
 */

export const TOKEN = {
  name: "Degxifi Token",
  symbol: "DEGX",
  ticker: "$DEGX",
  blockchain: "Solana",
  totalSupply: 1_000_000_000,
  presaleAllocation: 250_000_000, // 25% of supply
  launchPlatform: "Jupiter Studio",
  graduationMarketCap: 600_000, // USDC
  quoteCurrency: "USDC",
} as const;

export const PRESALE = {
  totalRaiseTarget: 120_000, // USDC
  durationDays: 7,
  minBuy: 50, // USDC, all tiers
} as const;

export const TIERS = [
  {
    id: 1,
    name: "Early Believers",
    tagline: "The earliest entry, the lowest price.",
    price: 0.00036,
    impliedMarketCap: 360_000,
    tokensAvailable: 83_300_000,
    raiseTarget: 30_000,
    minBuy: 50,
    maxBuy: 500,
    estWallets: { min: 60, max: 600 },
    roiAtGraduation: 0.67,
  },
  {
    id: 2,
    name: "Early Supporters",
    tagline: "Still well ahead of the public.",
    price: 0.00048,
    impliedMarketCap: 480_000,
    tokensAvailable: 83_300_000,
    raiseTarget: 40_000,
    minBuy: 50,
    maxBuy: 1_000,
    estWallets: { min: 40, max: 800 },
    roiAtGraduation: 0.25,
  },
  {
    id: 3,
    name: "Public Presale",
    tagline: "Last call before graduation.",
    price: 0.0006,
    impliedMarketCap: 600_000,
    tokensAvailable: 83_400_000,
    raiseTarget: 50_000,
    minBuy: 50,
    maxBuy: 2_000,
    estWallets: { min: 25, max: 1_000 },
    roiAtGraduation: 0,
  },
] as const satisfies readonly Tier[];

/**
 * Profit scenarios (brief §3) — ROI per tier (fraction) at each market cap.
 * Internally consistent: price/token = marketCap ÷ total supply (1B).
 */
export const PROFIT_SCENARIOS = [
  { marketCap: 600_000, pricePerToken: 0.0006, roi: { 1: 0.67, 2: 0.25, 3: 0 } },
  { marketCap: 1_000_000, pricePerToken: 0.001, roi: { 1: 1.78, 2: 1.08, 3: 0.67 } },
  { marketCap: 2_000_000, pricePerToken: 0.002, roi: { 1: 4.56, 2: 3.17, 3: 2.33 } },
  { marketCap: 5_000_000, pricePerToken: 0.005, roi: { 1: 12.89, 2: 9.42, 3: 7.33 } },
  { marketCap: 10_000_000, pricePerToken: 0.01, roi: { 1: 26.78, 2: 19.83, 3: 15.67 } },
] as const satisfies readonly ProfitScenario[];

/** Wallets supported by the connect flow (brief §4.4). */
export const SUPPORTED_WALLETS = ["Phantom", "Backpack", "Solflare"] as const;
