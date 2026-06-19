import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferFeeConfig,
} from "@solana/spl-token";

/**
 * Shared token-distribution primitives (server route + wallet-signing UI).
 * All amounts are integer base units (mint smallest unit) as bigint — no floats.
 *
 * Program-aware: the mint may be on the legacy SPL Token program OR Token-2022
 * (Jupiter Studio / pump-style launches are often Token-2022). We detect the
 * owning program from the mint account and thread it through mint reads, ATA
 * derivation, and the transfer/create instructions — they are NOT interchangeable.
 */

export const ATA_RENT_LAMPORTS = 2_039_280; // rent-exempt min for a token account
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const BATCH_SIZE = 8; // transfers per transaction (fits the 1232-byte limit)

export type PlanRecipient = { wallet: string; owed: string }; // owed in base units
export type DistributionPlan = {
  configured: boolean; // true once a valid mint is set and loadable
  mint: string; // "" until the admin sets it
  tokenProgram: string; // owning program id (legacy or Token-2022)
  decimals: number;
  transferFeeBps: number; // >0 means recipients receive LESS than sent (warn)
  unlockBps: number;
  recipients: PlanRecipient[];
  totals: {
    recipientCount: number;
    allocatedTotal: string;
    distributedTotal: string;
    owedTotal: string;
  };
  error?: string; // e.g. mint set but not loadable
};

/** Cumulative unlocked target (floored). 100% returns exactly `total` → no dust. */
export function unlockedTarget(totalBase: bigint, unlockBps: number): bigint {
  if (unlockBps >= 10000) return totalBase;
  if (unlockBps <= 0) return 0n;
  return (totalBase * BigInt(unlockBps)) / 10000n;
}

/** The SPL token program that owns this mint (legacy or Token-2022). */
export async function getTokenProgram(c: Connection, mint: PublicKey): Promise<PublicKey> {
  const acct = await c.getAccountInfo(mint);
  if (!acct) throw new Error("Mint account not found on-chain.");
  if (acct.owner.equals(TOKEN_PROGRAM_ID) || acct.owner.equals(TOKEN_2022_PROGRAM_ID))
    return acct.owner;
  throw new Error("Address is not an SPL token mint.");
}

/** Decimals + owning program + transfer-fee (bps) for a mint, either program. */
export async function getMintInfo(
  c: Connection,
  mint: PublicKey,
): Promise<{ decimals: number; programId: PublicKey; transferFeeBps: number }> {
  const programId = await getTokenProgram(c, mint);
  const mintAccount = await getMint(c, mint, undefined, programId);
  let transferFeeBps = 0;
  if (programId.equals(TOKEN_2022_PROGRAM_ID)) {
    const fee = getTransferFeeConfig(mintAccount);
    if (fee) transferFeeBps = fee.newerTransferFee.transferFeeBasisPoints;
  }
  return { decimals: mintAccount.decimals, programId, transferFeeBps };
}

export const degxAta = (mint: PublicKey, owner: PublicKey, programId: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, programId); // allowOwnerOffCurve: any recipient

/** The subset of these owners whose token ATA does NOT yet exist (needs creating). */
export async function fetchMissingAtas(
  c: Connection,
  mint: PublicKey,
  owners: PublicKey[],
  programId: PublicKey,
): Promise<Set<string>> {
  const missing = new Set<string>();
  const atas = owners.map((o) => degxAta(mint, o, programId));
  for (let i = 0; i < atas.length; i += 100) {
    const chunk = atas.slice(i, i + 100);
    const infos = await c.getMultipleAccountsInfo(chunk);
    infos.forEach((info, j) => {
      if (!info) missing.add(chunk[j]!.toBase58());
    });
  }
  return missing;
}

export type BatchRecipient = { owner: PublicKey; amount: bigint; needsAta: boolean };

/** Build one UNSIGNED v0 transfer batch (the connected wallet signs it). */
export function buildUnsignedBatch(params: {
  payer: PublicKey; // the treasury wallet (source owner + fee/rent payer)
  mint: PublicKey;
  sourceAta: PublicKey;
  decimals: number;
  programId: PublicKey;
  recipients: BatchRecipient[];
  blockhash: string;
  priorityMicroLamports: number;
}): VersionedTransaction {
  const { payer, mint, sourceAta, decimals, programId, recipients, blockhash } = params;
  const createCount = recipients.filter((r) => r.needsAta).length;
  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({
      units: Math.min(1_400_000, 20_000 + createCount * 30_000 + recipients.length * 8_000),
    }),
  ];
  if (params.priorityMicroLamports > 0) {
    ixs.push(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: params.priorityMicroLamports }),
    );
  }
  for (const r of recipients) {
    const recipientAta = degxAta(mint, r.owner, programId);
    if (r.needsAta) {
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          payer,
          recipientAta,
          r.owner,
          mint,
          programId,
        ),
      );
    }
    ixs.push(
      createTransferCheckedInstruction(
        sourceAta,
        mint,
        recipientAta,
        payer,
        r.amount,
        decimals,
        [],
        programId,
      ),
    );
  }
  const msg = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}

export type SigStatus = "confirmed" | "failed" | "expired" | "pending";

/** Classify in-flight signatures against the chain (server reconcile). */
export async function classifySignatures(
  c: Connection,
  items: { sig: string; lvbh: number }[],
): Promise<Map<string, SigStatus>> {
  const out = new Map<string, SigStatus>();
  const sigs = [...new Set(items.map((i) => i.sig))];
  if (sigs.length === 0) return out;
  const lvbhBySig = new Map(items.map((i) => [i.sig, i.lvbh]));
  const statuses = new Map<string, Awaited<ReturnType<Connection["getSignatureStatuses"]>>["value"][number]>();
  for (let i = 0; i < sigs.length; i += 256) {
    const chunk = sigs.slice(i, i + 256);
    const { value } = await c.getSignatureStatuses(chunk, { searchTransactionHistory: true });
    chunk.forEach((s, j) => statuses.set(s, value[j]));
  }
  const height = await c.getBlockHeight("confirmed");
  for (const sig of sigs) {
    const st = statuses.get(sig);
    if (st?.err) out.set(sig, "failed");
    else if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized")
      out.set(sig, "confirmed");
    else if (height > (lvbhBySig.get(sig) ?? 0)) out.set(sig, st ? "confirmed" : "expired");
    else out.set(sig, "pending");
  }
  return out;
}

/** Whole-token display from base units (allocations are whole tokens). */
export function formatTokens(base: bigint, decimals: number): string {
  return (base / 10n ** BigInt(decimals)).toLocaleString("en-US");
}

// ---- exact amount math (shared by the script + the app) ---------------------

/** Parse a decimal token string ("285416" / "285,416.5") to base units. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const cleaned = amount.trim().replace(/[,_]/g, "");
  if (cleaned === "" || cleaned === "-") return 0n;
  const neg = cleaned.startsWith("-");
  const body = neg ? cleaned.slice(1) : cleaned;
  const [intPart = "0", fracRaw = ""] = body.split(".");
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  const base = BigInt(intPart || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
  return neg ? -base : base;
}

/** Format base units to a human decimal string (trailing zeros trimmed). */
export function fromBaseUnits(value: bigint, decimals: number): string {
  const d = 10n ** BigInt(decimals);
  const sign = value < 0n ? "-" : "";
  const v = value < 0n ? -value : value;
  const whole = v / d;
  const frac = v % d;
  if (frac === 0n) return `${sign}${whole}`;
  return `${sign}${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

/** Thousands-grouped integer for display. */
export function group(n: bigint | number): string {
  return n.toLocaleString("en-US");
}
