import { type Cluster } from "@solana/web3.js";

/** Public Solana / USDC config (browser-safe). The RPC provider key is NEVER
 *  here — the browser uses the same-origin {@link RPC_PROXY_PATH} proxy, which
 *  forwards to the server-only `SOLANA_RPC_URL` (see app/api/rpc/route.ts). */

export const SOLANA_NETWORK = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ??
  "mainnet-beta") as Cluster;

/** Same-origin RPC proxy path — keeps the provider key server-side. */
export const RPC_PROXY_PATH = "/api/rpc";

/** USDC SPL mint (defaults to Solana mainnet USDC). */
export const USDC_MINT_ADDRESS =
  process.env.NEXT_PUBLIC_USDC_MINT ||
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const USDC_DECIMALS = 6;

/** USDC receiving wallet — provided by the client before launch (public-safe). */
export const PRESALE_WALLET_ADDRESS =
  process.env.NEXT_PUBLIC_PRESALE_WALLET || "";

export const isPresaleConfigured = () => PRESALE_WALLET_ADDRESS.length > 0;

/** Solscan tx link for the active cluster. */
export const solscanTx = (signature: string) =>
  `https://solscan.io/tx/${signature}` +
  (SOLANA_NETWORK !== "mainnet-beta" ? `?cluster=${SOLANA_NETWORK}` : "");
