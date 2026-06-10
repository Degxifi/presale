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
