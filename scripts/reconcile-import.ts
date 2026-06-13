/**
 * Reconcile unrecorded on-chain USDC payments INTO the contributions table.
 *
 * For each verified USDC transfer to the presale wallet that has no DB row, it
 * resolves a tier and (with --commit) inserts a 'confirmed' contribution so the
 * buyer's allocation is counted. Tier resolution, most-confident first:
 *   1. matched-wallet  — the wallet already has recorded row(s): reuse the best
 *      (lowest-id) tier it demonstrated eligibility for whose cap fits the amount.
 *   2. amount>$1000    — only Tier 1 allows >$500/$1000, so it must be Tier 1.
 *   3. ambiguous       — no recorded row AND amount <= $1000: tier can't be
 *      proven (Tier 1/2/3 all allow it). NOT inserted; listed for a decision.
 *
 * DRY-RUN by default (no writes). Pass `--commit` to insert the resolved rows.
 * Idempotent: skips any tx_sig already present. Read paths are unaffected.
 *
 *   bun --env-file=.env.local run scripts/reconcile-import.ts            # dry-run
 *   bun --env-file=.env.local run scripts/reconcile-import.ts --commit   # write
 */
import { Connection, PublicKey, type TokenBalance } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PRESALE_WALLET_ADDRESS,
  USDC_DECIMALS,
  USDC_MINT_ADDRESS,
} from "@/lib/solana/config";
import { TIERS } from "@/lib/constants";
import { db } from "@/lib/db";
import { contributions } from "@/lib/db/schema";
import type { TierId } from "@/types/presale";

const RPC_URL = process.env.SOLANA_RPC_URL;
const COMMIT = process.argv.includes("--commit");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const maxBuy = (t: TierId) => TIERS.find((x) => x.id === t)!.maxBuy;

async function main() {
  if (!db) throw new Error("DATABASE_URL is not set — run with --env-file=.env.local");
  const connection = new Connection(RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");
  const mint = new PublicKey(USDC_MINT_ADDRESS);
  const ata = getAssociatedTokenAddressSync(mint, new PublicKey(PRESALE_WALLET_ADDRESS));

  // Recorded rows: tx_sig set (idempotency) + per-wallet tier history + memberUid.
  const rows = await db
    .select({
      wallet: contributions.wallet,
      tier: contributions.tier,
      txSig: contributions.txSig,
      memberUid: contributions.memberUid,
    })
    .from(contributions);
  const recordedSigs = new Set(rows.map((r) => r.txSig));
  const walletTiers = new Map<string, Set<number>>();
  const walletUid = new Map<string, string>();
  for (const r of rows) {
    if (!walletTiers.has(r.wallet)) walletTiers.set(r.wallet, new Set());
    walletTiers.get(r.wallet)!.add(r.tier);
    if (r.memberUid && !walletUid.has(r.wallet)) walletUid.set(r.wallet, r.memberUid);
  }
  console.log(`DB: ${recordedSigs.size} recorded rows, ${walletTiers.size} distinct wallets.\n`);

  // On-chain signatures crediting the presale ATA, minus the recorded ones.
  const sigs: string[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await connection.getSignaturesForAddress(ata, { limit: 1000, before });
    if (page.length === 0) break;
    for (const s of page) if (!s.err) sigs.push(s.signature);
    before = page[page.length - 1]!.signature;
    if (page.length < 1000) break;
    await sleep(150);
  }
  const toCheck = sigs.filter((s) => !recordedSigs.has(s));
  console.log(`On-chain: ${sigs.length} sigs; ${toCheck.length} not in DB — inspecting…\n`);

  const recipientUsdc = (list: TokenBalance[] | null | undefined) =>
    (list ?? []).find((b) => b.mint === USDC_MINT_ADDRESS && b.owner === PRESALE_WALLET_ADDRESS);

  type Plan = {
    sig: string; wallet: string; amount: number; at: Date;
    tier: TierId | null; status: "confirmed" | "pending" | null;
    how: string; memberUid: string | null;
  };
  const plans: Plan[] = [];
  const failed: string[] = [];

  const CHUNK = 8;
  for (let i = 0; i < toCheck.length; i += CHUNK) {
    const results = await Promise.all(
      toCheck.slice(i, i + CHUNK).map((sig) =>
        connection
          .getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
          .then((tx) => ({ sig, tx, errored: false }))
          .catch(() => ({ sig, tx: null, errored: true })),
      ),
    );
    for (const { sig, tx, errored } of results) {
      if (errored) { failed.push(sig); continue; }
      if (!tx || tx.meta?.err) continue;
      const pre = BigInt(recipientUsdc(tx.meta?.preTokenBalances)?.uiTokenAmount.amount ?? "0");
      const post = BigInt(recipientUsdc(tx.meta?.postTokenBalances)?.uiTokenAmount.amount ?? "0");
      const delta = post - pre;
      if (delta <= BigInt(0)) continue;
      const amount = Number(delta) / 10 ** USDC_DECIMALS;
      const wallet = tx.transaction.message.accountKeys[0]?.pubkey.toBase58() ?? "unknown";

      // Resolve tier + status.
      //  - CONFIRMED (provable tier): wallet has recorded rows → reuse its tier;
      //    or amount > Tier-2 cap → must be Tier 1.
      //  - PENDING (ambiguous): no recorded row and <= $1000 — park as 'pending'
      //    (flagged for manual review; excluded from totals/caps/distribution)
      //    with a placeholder tier the admin corrects: <=$500 → T3, else → T2.
      //  - SKIP: sub-$50 dust / below-min — not a valid contribution.
      let tier: TierId | null = null;
      let status: "confirmed" | "pending" | null = null;
      let how = "";
      const known = walletTiers.get(wallet);
      if (known && known.size > 0) {
        const fits = [...known].filter((t) => amount <= maxBuy(t as TierId) + 0.01).sort((a, b) => a - b);
        tier = (fits[0] ?? Math.min(...known)) as TierId;
        status = "confirmed";
        how = "matched-wallet";
      } else if (amount > maxBuy(2) + 0.01) {
        tier = 1; status = "confirmed"; how = "amount>tier2cap→tier1";
      } else if (amount < 50) {
        how = "dust/below-min(skip)";
      } else if (amount <= maxBuy(3) + 0.01) {
        tier = 3; status = "pending"; how = "ambiguous→pending(<=500,placeholderT3)";
      } else {
        tier = 2; status = "pending"; how = "ambiguous→pending(500-1000,placeholderT2)";
      }
      plans.push({ sig, wallet, amount, at: new Date((tx.blockTime ?? 0) * 1000), tier, status, how, memberUid: walletUid.get(wallet) ?? null });
    }
    await sleep(150);
  }

  // Report buckets.
  const sum = (a: Plan[]) => a.reduce((s, p) => s + p.amount, 0);
  const confirmed = plans.filter((p) => p.status === "confirmed");
  const pending = plans.filter((p) => p.status === "pending");
  const dust = plans.filter((p) => p.status === null);
  const toInsert = [...confirmed, ...pending];
  const byHow = new Map<string, { n: number; usd: number }>();
  for (const p of toInsert) {
    const e = byHow.get(p.how) ?? { n: 0, usd: 0 };
    e.n++; e.usd += p.amount; byHow.set(p.how, e);
  }
  console.log("=== RESOLUTION PLAN ===");
  for (const [k, e] of byHow) console.log(`  ${k}: ${e.n}, $${e.usd.toFixed(2)}`);
  console.log(
    `  → confirmed ${confirmed.length} ($${sum(confirmed).toFixed(2)}) · pending ${pending.length} ($${sum(pending).toFixed(2)}) · dust/skip ${dust.length}`,
  );
  if (failed.length) console.log(`  ⚠ ${failed.length} sig(s) could not be inspected (RPC error) — re-run.`);

  if (!COMMIT) {
    console.log(
      `\nDRY-RUN — no writes. Re-run with --commit to insert ${toInsert.length} rows (${confirmed.length} confirmed, ${pending.length} pending). ${dust.length} dust/below-min skipped.`,
    );
    process.exit(0);
  }

  // Commit: insert each row at its resolved status (idempotent on tx_sig). Dust
  // (status null) is never inserted.
  console.log(`\nCOMMITTING ${toInsert.length} rows (${confirmed.length} confirmed, ${pending.length} pending)…`);
  let inserted = 0, skipped = 0;
  for (const p of toInsert) {
    try {
      await db.insert(contributions).values({
        wallet: p.wallet,
        tier: p.tier!,
        amountUsdc: String(p.amount),
        txSig: p.sig,
        memberUid: p.memberUid,
        status: p.status!,
        createdAt: p.at,
      });
      inserted++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("23505")) { skipped++; continue; }
      console.error(`  FAILED ${p.sig}:`, e);
    }
  }
  console.log(`Done. Inserted ${inserted}, skipped ${skipped} (already present). Dust/below-min not inserted: ${dust.length}.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
