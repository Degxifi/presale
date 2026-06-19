/**
 * Public Solana / USDC config (browser-safe). **Mainnet only** — the network and
 * USDC mint are fixed constants (no env needed). The RPC provider key is NEVER
 * here; the browser uses the same-origin {@link RPC_PROXY_PATH} proxy, which
 * forwards to the server-only `SOLANA_RPC_URL` (see app/api/rpc/route.ts).
 */

export const SOLANA_NETWORK = "mainnet-beta";

/** Same-origin RPC proxy path — keeps the provider key server-side. */
export const RPC_PROXY_PATH = "/api/rpc";

/** USDC SPL mint on Solana mainnet. */
export const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const USDC_DECIMALS = 6;

// The $DEGX mint is admin-set (stored in app_settings, entered in the dashboard
// after the Jupiter Studio launch) — not an env var. See the distribution routes.

/**
 * USDC receiving wallet — HARDCODED for max security (immutable; not env- or
 * admin-settable, so it can't be redirected by a config change or compromised
 * admin). All presale USDC is sent here.
 */
export const PRESALE_WALLET_ADDRESS = "yDAtT5WmU83NFRKgLMryL825RnGWmxbUe7g4NYZa5CM";

export const isPresaleConfigured = () => PRESALE_WALLET_ADDRESS.length > 0;

const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const WALLET_RE = new RegExp(`^${BASE58}{32,44}$`);
const TXSIG_RE = new RegExp(`^${BASE58}{64,90}$`);

/** Cheap base58 shape check for a Solana wallet pubkey (no key import). */
export const isLikelyWalletAddress = (s: unknown): s is string =>
  typeof s === "string" && WALLET_RE.test(s);

/** Cheap base58 shape check for a Solana transaction signature. */
export const isLikelyTxSignature = (s: unknown): s is string =>
  typeof s === "string" && TXSIG_RE.test(s);

/** Solscan transaction link (mainnet). */
export const solscanTx = (signature: string) =>
  `https://solscan.io/tx/${signature}`;
