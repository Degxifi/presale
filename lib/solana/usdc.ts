import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { USDC_DECIMALS, USDC_MINT_ADDRESS } from "./config";

/** Convert a human USDC amount to base units (6 decimals). */
export const usdcBaseUnits = (amount: number): bigint =>
  BigInt(Math.round(amount * 10 ** USDC_DECIMALS));

/** Lamports the payer needs for the tx fee plus possible ATA rent. */
const MIN_SOL_LAMPORTS = 2_000_000; // ~0.002 SOL

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
    return "You need a small amount of SOL (~0.002) in your wallet to pay network fees.";
  }
  return null;
}

/**
 * Build a USDC transfer from `payer` to `recipientWallet`. Creates the
 * recipient's USDC token account if it doesn't exist yet (idempotent). The
 * returned transaction carries the blockhash used, for confirmation.
 */
export async function buildUsdcTransfer(
  connection: Connection,
  payer: PublicKey,
  recipientWallet: PublicKey,
  amount: number,
): Promise<Transaction> {
  const mint = new PublicKey(USDC_MINT_ADDRESS);
  const fromAta = getAssociatedTokenAddressSync(mint, payer);
  const toAta = getAssociatedTokenAddressSync(mint, recipientWallet);

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer, // payer (funds the account if it must be created)
      toAta,
      recipientWallet,
      mint,
    ),
  );
  tx.add(
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      payer,
      usdcBaseUnits(amount),
      USDC_DECIMALS,
    ),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payer;
  return tx;
}

/**
 * Confirm a signature by polling getSignatureStatuses over HTTP (works through
 * the RPC proxy, which has no WebSocket — so we avoid connection.confirmTransaction).
 */
export async function confirmSignature(
  connection: Connection,
  signature: string,
  timeoutMs = 60_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new Error("Transaction failed on-chain.");
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Confirmation timed out — check the transaction on Solscan.");
}
