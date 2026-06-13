import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { USDC_DECIMALS, USDC_MINT_ADDRESS } from "./config";

/** Convert a human USDC amount to base units (6 decimals). */
export const usdcBaseUnits = (amount: number): bigint =>
  BigInt(Math.round(amount * 10 ** USDC_DECIMALS));

/**
 * Lamports the payer needs: ~5k base fee + ~6k priority fee + the ~0.00204 SOL
 * rent-exempt minimum if THIS buyer has to create the recipient's USDC ATA
 * (only the very first contributor — after that the ATA already exists).
 */
const MIN_SOL_LAMPORTS = 2_060_000; // ~0.00206 SOL

/**
 * Pre-flight funds check so buyers get a clear message instead of an opaque
 * wallet broadcast error. Returns a user-facing problem description, or null
 * when the wallet can cover `amount` USDC plus network fees.
 */
export async function checkFunds(
  connection: Connection,
  payer: PublicKey,
  amount: number,
): Promise<string | null> {
  const mint = new PublicKey(USDC_MINT_ADDRESS);
  const fromAta = getAssociatedTokenAddressSync(mint, payer);

  let usdcBalance = BigInt(0);
  try {
    const { value } = await connection.getTokenAccountBalance(fromAta);
    usdcBalance = BigInt(value.amount);
  } catch {
    // Token account doesn't exist — the wallet holds no USDC.
  }
  if (usdcBalance < usdcBaseUnits(amount)) {
    const held = Number(usdcBalance) / 10 ** USDC_DECIMALS;
    return `You need at least ${amount} USDC in your wallet (current balance: ${held.toFixed(2)} USDC).`;
  }

  const lamports = await connection.getBalance(payer);
  if (lamports < MIN_SOL_LAMPORTS) {
    return "You need a small amount of SOL (~0.0021) in your wallet to pay network fees.";
  }
  return null;
}

/**
 * Build a USDC transfer from `payer` to `recipientWallet` as a v0
 * VersionedTransaction. Creates the recipient's USDC token account if it doesn't
 * exist yet (idempotent).
 *
 * Why versioned (not legacy `Transaction`): wallets — especially mobile / Mobile
 * Wallet Adapter — sign v0 transactions far more reliably. A legacy
 * `Transaction.serialize()` (which the wallet adapter calls inside
 * `sendTransaction`) throws "Signature verification failed. Missing signature
 * for public key …" when the wallet returns the tx unsigned; the v0 path avoids
 * that failure mode. The blockhash is fetched right before compiling so it isn't
 * stale by the time the wallet signs.
 */
export async function buildUsdcTransfer(
  connection: Connection,
  payer: PublicKey,
  recipientWallet: PublicKey,
  amount: number,
): Promise<{ tx: VersionedTransaction; lastValidBlockHeight: number }> {
  const mint = new PublicKey(USDC_MINT_ADDRESS);
  const fromAta = getAssociatedTokenAddressSync(mint, payer);
  const toAta = getAssociatedTokenAddressSync(mint, recipientWallet);

  const instructions = [
    // Priority fee so the transfer lands promptly under launch-day congestion
    // (without it, a tx can sit unconfirmed past the 60s confirm window). The
    // unit limit is generous for an idempotent-ATA + transfer; at ~120k CU the
    // fee is ~0.000006 SOL — negligible and covered by the checkFunds SOL floor.
    ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      payer, // payer (funds the account if it must be created)
      toAta,
      recipientWallet,
      mint,
    ),
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      payer,
      usdcBaseUnits(amount),
      USDC_DECIMALS,
    ),
  ];

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  // lastValidBlockHeight lets the caller distinguish a dropped/expired tx from a
  // slow one during confirmation (skipPreflight has no preflight to reject it).
  return { tx: new VersionedTransaction(message), lastValidBlockHeight };
}

/**
 * Confirm a signature by polling getSignatureStatuses over HTTP (works through
 * the RPC proxy, which has no WebSocket — so we avoid connection.confirmTransaction).
 *
 * Throws one of three distinct, terminal errors: "failed on-chain" (the tx ran
 * and errored), "expired before confirming" (the blockhash lapsed with no status
 * — the tx will never land; only checked when `lastValidBlockHeight` is given),
 * or a generic timeout. Transient RPC errors (429 from the per-IP proxy limit,
 * network blips) are swallowed and polling continues, so a rate-limit blip
 * during confirmation never surfaces as a scary failure for a paid tx. The 2.5s
 * interval keeps the worst-case call count within the proxy's per-minute limit.
 */
export async function confirmSignature(
  connection: Connection,
  signature: string,
  lastValidBlockHeight?: number,
  timeoutMs = 90_000,
): Promise<void> {
  const start = Date.now();
  let polls = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const { value } = await connection.getSignatureStatuses([signature]);
      const status = value[0];
      if (status?.err) throw new Error("Transaction failed on-chain.");
      if (
        status?.confirmationStatus === "confirmed" ||
        status?.confirmationStatus === "finalized"
      ) {
        return;
      }
      // No status yet and the blockhash has expired → the tx will never land
      // (skipPreflight means nothing rejected it up front). Fail fast and
      // distinctly so the UI prompts a retry instead of a false "still
      // confirming" success. Checked occasionally to limit RPC calls.
      if (lastValidBlockHeight !== undefined && !status && polls % 3 === 2) {
        const height = await connection.getBlockHeight();
        if (height > lastValidBlockHeight) {
          throw new Error("Transaction expired before confirming — please try again.");
        }
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (/failed on-chain|expired before confirming/i.test(m)) throw e;
      // else transient (429/network) — keep polling
    }
    polls++;
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  throw new Error("Confirmation timed out — check the transaction on Solscan.");
}
