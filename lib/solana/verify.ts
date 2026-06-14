import { Connection, type TokenBalance } from "@solana/web3.js";
import { USDC_DECIMALS, USDC_MINT_ADDRESS } from "./config";

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
  // NOTE: commitment is "confirmed" (not "finalized") so recording is fast at
  // launch. A confirmed-but-not-finalized slot could in theory be rolled back
  // in a reorg; on mainnet this is rare and accepted for the presale window.
  let tx;
  try {
    tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
  } catch (e) {
    // Log the REAL upstream error server-side (a suspended/blown RPC provider
    // returning 401/403/429 here silently breaks contribution recording — this
    // makes it visible in the container logs). The client still gets a generic,
    // safe message so we don't leak provider internals / a probe oracle.
    console.error(
      `[verify] getParsedTransaction failed sig=${signature}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    throw new Error("Couldn't reach the network to verify the transaction. Please try again.");
  }

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
  // Integer math on raw base units — `uiAmount` is a float and can lose
  // precision; the raw `amount` string is exact.
  const pre = BigInt(
    recipientUsdc(tx.meta?.preTokenBalances)?.uiTokenAmount.amount ?? "0",
  );
  const post = BigInt(
    recipientUsdc(tx.meta?.postTokenBalances)?.uiTokenAmount.amount ?? "0",
  );

  const delta = post - pre;
  if (delta <= BigInt(0))
    throw new Error("No USDC was credited to the presale wallet.");
  // 6 decimals: Number stays exact far beyond any realistic presale amount.
  return { amount: Number(delta) / 10 ** USDC_DECIMALS };
}
