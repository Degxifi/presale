import { Connection, PublicKey } from "@solana/web3.js";
import { classifySignatures, getMintInfo, unlockedTarget } from "@/lib/solana/distribute";
import {
  clearInflight,
  commitConfirmed,
  getConfirmedAllocations,
  getDistributionRows,
} from "@/lib/db/queries";

/**
 * Distribution orchestration shared by the in-app API route AND the CLI script.
 * Both compute the plan identically and heal/commit against the SAME ledger (the
 * `distributions` table), which is what keeps "exactly-once" true no matter which
 * path an operator uses — a wallet-signed wave in the dashboard and an env-key
 * wave from the script can't pay the same wallet twice.
 *
 * The pure Solana primitives (tx building, signature classification) live in
 * lib/solana/distribute.ts and are safe in the browser; THIS layer adds the DB
 * ledger and is server-only — never import it from a client component.
 */

export type PlanRecipient = {
  wallet: string;
  owed: bigint; // base units to send this tranche
  target: bigint; // cumulative cap at this unlock — the WAL atomic guard uses it
};

export type DistributionPlan = {
  decimals: number;
  programId: PublicKey; // legacy SPL or Token-2022 — they are NOT interchangeable
  transferFeeBps: number; // >0 ⇒ recipients receive less than `owed`
  recipients: PlanRecipient[];
  allocatedTotal: bigint;
  distributedTotal: bigint;
  owedTotal: bigint;
};

/**
 * Reconcile in-flight transfers against the chain: commit the ones that landed,
 * clear the ones that provably died (failed, or blockhash-expired so the signed
 * tx can never land). Idempotent — called on every plan build, which is how a
 * crashed/interrupted run self-heals before we compute fresh owed amounts.
 */
export async function reconcileInflight(c: Connection): Promise<void> {
  const rows = await getDistributionRows();
  const inflight = rows
    .filter((r) => r.inflightSig)
    .map((r) => ({ sig: r.inflightSig!, lvbh: r.inflightLvbh ?? 0 }));
  if (inflight.length === 0) return;
  const cls = await classifySignatures(c, inflight);
  const confirmed = [...cls].filter(([, s]) => s === "confirmed").map(([s]) => s);
  const dead = [...cls].filter(([, s]) => s === "failed" || s === "expired").map(([s]) => s);
  if (confirmed.length) await commitConfirmed(confirmed);
  if (dead.length) await clearInflight(dead);
}

/**
 * Build the owed plan for a cumulative unlock %, reconciling in-flight first:
 *   owed = floor(allocation × unlock%) − distributed − in-flight   (per wallet)
 * Allocations come from the confirmed `contributions` (the imported master list).
 * Throws if the mint can't be loaded — the caller decides how to surface that.
 */
export async function buildPlan(
  c: Connection,
  mint: PublicKey,
  unlockBps: number,
): Promise<DistributionPlan> {
  const { decimals, programId, transferFeeBps } = await getMintInfo(c, mint);
  await reconcileInflight(c);

  const state = new Map((await getDistributionRows()).map((r) => [r.wallet, r]));
  const alloc = await getConfirmedAllocations();
  const scale = 10n ** BigInt(decimals);

  let allocatedTotal = 0n;
  let distributedTotal = 0n;
  let owedTotal = 0n;
  const recipients: PlanRecipient[] = [];
  for (const [wallet, tokens] of alloc) {
    const totalBase = tokens * scale;
    allocatedTotal += totalBase;
    const st = state.get(wallet);
    const distributed = st ? BigInt(st.distributed) : 0n;
    const inflightAmt = st?.inflightAmount ? BigInt(st.inflightAmount) : 0n;
    distributedTotal += distributed;
    const target = unlockedTarget(totalBase, unlockBps);
    const owed = target - distributed - inflightAmt;
    if (owed > 0n) {
      recipients.push({ wallet, owed, target });
      owedTotal += owed;
    }
  }
  recipients.sort((a, b) => (b.owed > a.owed ? 1 : -1));
  return { decimals, programId, transferFeeBps, recipients, allocatedTotal, distributedTotal, owedTotal };
}
