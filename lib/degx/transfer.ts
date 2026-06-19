import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";

/**
 * Server-only $DEGX transfer primitives, shared by the claim API and the airdrop
 * script. The owed MATH lives in lib/claim.ts (client+server safe); this file is
 * the on-chain half (treasury keypair, mint context, build/send) and must never
 * be imported into a client component.
 */

export function loadTreasuryKeypair(secretBase58: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(secretBase58));
}

export type MintCtx = { mint: PublicKey; programId: PublicKey; decimals: number };

/** Detect the token program (classic vs Token-2022) and read decimals on-chain. */
export async function getMintCtx(conn: Connection, mintAddress: string): Promise<MintCtx> {
  const mint = new PublicKey(mintAddress);
  const info = await conn.getAccountInfo(mint, "confirmed");
  if (!info) throw new Error(`$DEGX mint ${mintAddress} not found on-chain — is the token launched?`);
  const programId = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const decimals = (await getMint(conn, mint, "confirmed", programId)).decimals;
  return { mint, programId, decimals };
}

export function toAtomic(whole: number, decimals: number): bigint {
  return BigInt(whole) * BigInt(10) ** BigInt(decimals);
}

export function treasuryAtaFor(ctx: MintCtx, treasury: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(ctx.mint, treasury, false, ctx.programId);
}

/** ATA-idempotent create + TransferChecked for ONE recipient (payer = treasury). */
export function buildRecipientIxns(
  ctx: MintCtx,
  treasury: PublicKey,
  recipient: PublicKey,
  wholeAmount: number,
): TransactionInstruction[] {
  const src = treasuryAtaFor(ctx, treasury);
  const dest = getAssociatedTokenAddressSync(ctx.mint, recipient, false, ctx.programId);
  return [
    createAssociatedTokenAccountIdempotentInstruction(treasury, dest, recipient, ctx.mint, ctx.programId),
    createTransferCheckedInstruction(src, ctx.mint, dest, treasury, toAtomic(wholeAmount, ctx.decimals), ctx.decimals, [], ctx.programId),
  ];
}

/** μLamports priority fee — p75 of recent fees, clamped to [10k, 500k]. */
async function dynamicPriorityFee(conn: Connection, accounts: PublicKey[]): Promise<number> {
  try {
    const fees = await conn.getRecentPrioritizationFees({ lockedWritableAccounts: accounts.slice(0, 5) });
    if (fees.length === 0) return 50_000;
    const sorted = fees.map((f) => f.prioritizationFee).sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 50_000;
    return Math.max(10_000, Math.min(p75, 500_000));
  } catch {
    return 50_000;
  }
}

export type SendResult = { sig?: string; confirmed: boolean; error?: string };

/**
 * Sign + send + confirm recipient instructions as ONE atomic tx. `sig` is set
 * once submitted; `confirmed` only after it lands. (never-submitted → no sig;
 * submitted-unconfirmed → sig + confirmed=false.)
 */
export async function sendIxns(
  conn: Connection,
  treasury: Keypair,
  recipientIxns: TransactionInstruction[],
  opts: { cuLimit?: number; priorityAccounts?: PublicKey[] } = {},
): Promise<SendResult> {
  const fee = await dynamicPriorityFee(conn, opts.priorityAccounts ?? []);
  const ixns: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({
      units: opts.cuLimit ?? Math.min(1_400_000, 80_000 * Math.ceil(recipientIxns.length / 2) + 60_000),
    }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: fee }),
    ...recipientIxns,
  ];
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(
    new TransactionMessage({ payerKey: treasury.publicKey, recentBlockhash: blockhash, instructions: ixns }).compileToV0Message(),
  );
  tx.sign([treasury]);

  // The signature is fixed the moment the tx is signed — capture it NOW. If
  // sendRawTransaction/confirm THROWS (RPC timeout/5xx while the tx may already
  // be gossiped — a well-known Solana failure mode, worsened by maxRetries), we
  // still return this sig with confirmed=false. Callers stamp sig+!confirmed as
  // 'submitted' (manual reconcile), NEVER 'failed'/retryable — so a landed-but-
  // unconfirmed transfer can never be auto-resent (= no double-spend). 'failed'
  // (retryable) is only reachable when no signature could exist at all.
  const sig = bs58.encode(tx.signatures[0]);
  try {
    await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
    const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) return { sig, confirmed: false, error: `on-chain: ${JSON.stringify(res.value.err)}` };
    return { sig, confirmed: true };
  } catch (e) {
    return { sig, confirmed: false, error: String(e instanceof Error ? e.message : e) };
  }
}

/** Convenience: send a whole-token amount to a single recipient (test/one-off). */
export async function sendDegx(
  conn: Connection,
  treasury: Keypair,
  ctx: MintCtx,
  recipient: PublicKey,
  wholeAmount: number,
): Promise<SendResult> {
  return sendIxns(conn, treasury, buildRecipientIxns(ctx, treasury.publicKey, recipient, wholeAmount), {
    cuLimit: 200_000,
    priorityAccounts: [treasuryAtaFor(ctx, treasury.publicKey)],
  });
}
