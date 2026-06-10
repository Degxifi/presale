import { Connection, type TokenBalance } from "@solana/web3.js";
import { USDC_MINT_ADDRESS } from "./config";

/** Server-only RPC (with provider key). Never imported by client code. */
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/**
 * Verify a confirmed USDC transfer, signed by `claimedWallet`, that credited
 * `recipientWallet`. Returns the USDC amount actually credited (the on-chain
 * amount is authoritative — never trust a client-claimed amount).
 */
export async function verifyUsdcContribution(
  signature: string,
  recipientWallet: string,
  claimedWallet: string,
): Promise<{ amount: number }> {
  const connection = new Connection(RPC_URL, "confirmed");
  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx) throw new Error("Transaction not found or not yet confirmed.");
  if (tx.meta?.err) throw new Error("Transaction failed on-chain.");

  const feePayer = tx.transaction.message.accountKeys[0]?.pubkey.toBase58();
  if (feePayer !== claimedWallet) {
    throw new Error("Transaction was not signed by this wallet.");
  }

  const recipientUsdc = (list: TokenBalance[] | null | undefined) =>
    (list ?? []).find(
      (b) => b.mint === USDC_MINT_ADDRESS && b.owner === recipientWallet,
    );
  const pre = Number(
    recipientUsdc(tx.meta?.preTokenBalances)?.uiTokenAmount.uiAmount ?? 0,
  );
  const post = Number(
    recipientUsdc(tx.meta?.postTokenBalances)?.uiTokenAmount.uiAmount ?? 0,
  );

  const amount = post - pre;
  if (amount <= 0) throw new Error("No USDC was credited to the presale wallet.");
  return { amount };
}
