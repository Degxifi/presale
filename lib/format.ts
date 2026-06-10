/**
 * Display formatting helpers (en-US). Used everywhere the UI shows money,
 * token amounts, percentages, or wallet addresses so formatting stays
 * consistent. Pure functions — safe in server and client components.
 */

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const usdCompactFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const numFmt = new Intl.NumberFormat("en-US");
const numCompactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

/** $1,234.00 */
export const usd = (n: number) => usdFmt.format(n);

/** $1.2M */
export const usdCompact = (n: number) => usdCompactFmt.format(n);

/** 1,234,567 */
export const num = (n: number) => numFmt.format(n);

/** 1.23M */
export const numCompact = (n: number) => numCompactFmt.format(n);

/** Token price with 5 decimals: 0.00036 -> "$0.00036" */
export const tokenPrice = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  })}`;

/** Signed percent from a fraction: 0.67 -> "+67%", 0 -> "0%", -0.1 -> "-10%" */
export const percent = (fraction: number, maximumFractionDigits = 0) =>
  `${fraction > 0 ? "+" : ""}${(fraction * 100).toLocaleString("en-US", {
    maximumFractionDigits,
  })}%`;

/** Compact DEGX amount: 83_300_000 -> "83.3M DEGX" */
export const degx = (n: number) => `${numCompact(n)} DEGX`;

/** Truncate a base58 wallet: "7xK9q2…q2Ab" */
export const shortWallet = (addr: string, lead = 4, tail = 4) =>
  addr.length <= lead + tail ? addr : `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
