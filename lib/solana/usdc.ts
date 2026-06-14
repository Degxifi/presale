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
 * True when a getTokenAccountBalance error AUTHORITATIVELY means the token
 * account doesn't exist (so the wallet really holds no USDC there) — as opposed
 * to a transient RPC failure. The Solana RPC returns -32602 "could not find
 * account" for a missing account; a 429 (the proxy's per-IP rate limit) or a
 * network blip does NOT, and must never be read as a zero balance.
 */
function isAccountNotFound(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  const msg = e instanceof Error ? e.message : "";
  return code === -32602 || /could not find account|find account/i.test(msg);
}

/**
 * Pre-flight funds check so buyers get a clear message instead of an opaque
 * wallet broadcast error. Returns a user-facing problem description, or null
 * when the wallet can cover `amount` USDC plus network fees.
 *
 * CRITICAL: it must distinguish "the wallet holds no USDC" from "we couldn't
 * read the balance." The balance is read through the rate-limited /api/rpc proxy
 * (60 req/min per IP); on a shared mobile/NAT IP a 429 or transient error is
 * common. Treating that as a 0 balance (the old behavior) hard-blocked funded
 * buyers with a false "current balance: 0.00 USDC". So we retry transient
 * failures and, if the balance still can't be determined, FAIL OPEN (return
 * null / allow the buy) rather than fabricate a zero — the wallet and the
 * on-chain transfer remain the real guard for a genuinely underfunded wallet.
 */
export async function checkFunds(
  connection: Connection,
  payer: PublicKey,
  amount: number,
): Promise<string | null> {
  const mint = new PublicKey(USDC_MINT_ADDRESS);
  const fromAta = getAssociatedTokenAddressSync(mint, payer);

  // null = could not determine (transient failure); BigInt = an authoritative
  // reading (including a genuine 0 when the ATA doesn't exist).
  let usdcBalance: bigint | null = null;
  for (const delay of [0, 800, 2_500]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const { value } = await connection.getTokenAccountBalance(fromAta);
      usdcBalance = BigInt(value.amount);
      break;
    } catch (e) {
      if (isAccountNotFound(e)) {
        usdcBalance = BigInt(0); // ATA doesn't exist → no USDC held here
        break;
      }
      // transient (429/network/provider) — retry; stays null if all attempts fail
    }
  }

  // Only block on a balance we actually read. If it's undetermined, don't
  // fabricate "0.00 USDC" — let the buyer proceed.
  if (usdcBalance !== null && usdcBalance < usdcBaseUnits(amount)) {
    const held = Number(usdcBalance) / 10 ** USDC_DECIMALS;
    return `You need at least ${amount} USDC in your wallet (current balance: ${held.toFixed(2)} USDC).`;
  }

  // SOL fee check — also tolerate an unreadable result rather than false-blocking
  // a funded buyer; a truly fee-starved tx fails clearly without moving USDC.
  try {
    const lamports = await connection.getBalance(payer);
    if (lamports < MIN_SOL_LAMPORTS) {
      return "You need a small amount of SOL (~0.0021) in your wallet to pay network fees.";
    }
  } catch {
    // couldn't read SOL balance (transient) — proceed
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
): Promise<VersionedTransaction> {
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

  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

/**
 * Confirm a signature by polling getSignatureStatuses over HTTP (works through
 * the RPC proxy, which has no WebSocket — so we avoid connection.confirmTransaction).
 *
 * Resolves on confirmation; throws "Transaction failed on-chain." if the tx ran
 * and errored; throws "Confirmation timed out." if it neither confirms nor errors
 * within the window. We deliberately do NOT try to detect blockhash expiry here:
 * the only signal (getBlockHeight) isn't on the proxy allowlist, and more
 * importantly a near-boundary status-propagation lag could mislabel a LANDED tx
 * as expired and prompt a retry → double-payment. So a timeout is reported as an
 * honest "couldn't confirm" (the caller must NOT claim success or auto-retry) and
 * the server-verified recorder decides the real outcome. Transient RPC errors
 * (429 from the per-IP limit, network blips) are swallowed so a blip never
 * surfaces as a scary failure for a paid tx; the 2.5s interval keeps the
 * worst-case call count within the proxy's per-minute limit.
 */
export async function confirmSignature(
  connection: Connection,
  signature: string,
  timeoutMs = 90_000,
): Promise<void> {
  const start = Date.now();
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
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (/failed on-chain/i.test(m)) throw e;
      // else transient (429/network) — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  throw new Error("Confirmation timed out.");
}
