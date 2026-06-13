/**
 * Reconcile on-chain USDC payments to the presale wallet against the
 * `contributions` table, and print verified transfers that have NO DB row.
 *
 * These are payments where the buyer's USDC landed on-chain but the dialog
 * errored before recording (e.g. the preflight false-negative, or a
 * confirmation timeout). They are invisible to totals / caps / the distribution
 * CSV until recorded or refunded.
 *
 * Run (needs SOLANA_RPC_URL + DATABASE_URL — use a Helius URL, not the public
 * RPC, or it will be rate-limited):
 *
 *   bun --env-file=.env.local run scripts/reconcile-contributions.ts
 *
 * Read-only: it does not write to the DB or the chain. Pipe the output to a file
 * if you want to keep it.
 */
import { Connection, PublicKey, type TokenBalance } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PRESALE_WALLET_ADDRESS,
  USDC_DECIMALS,
  USDC_MINT_ADDRESS,
} from "@/lib/solana/config";
import { db } from "@/lib/db";
import { contributions } from "@/lib/db/schema";

const RPC_URL = process.env.SOLANA_RPC_URL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!db) throw new Error("DATABASE_URL is not set — run with --env-file=.env.local");
  if (!RPC_URL) {
    console.warn(
      "[warn] SOLANA_RPC_URL not set — falling back to the public RPC, which will likely rate-limit. Set your Helius URL in .env.local.",
    );
  }
  const connection = new Connection(RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

  const mint = new PublicKey(USDC_MINT_ADDRESS);
  const presale = new PublicKey(PRESALE_WALLET_ADDRESS);
  const ata = getAssociatedTokenAddressSync(mint, presale);
  console.log(`Presale wallet: ${PRESALE_WALLET_ADDRESS}`);
  console.log(`Presale USDC ATA: ${ata.toBase58()}\n`);

  // 1) Every tx_sig already in the DB (any status — confirmed AND pending/flagged
  //    count as "recorded" so we don't re-flag them).
  const rows = await db
    .select({ txSig: contributions.txSig, status: contributions.status })
    .from(contributions);
  const recorded = new Set(rows.map((r) => r.txSig));
  console.log(`DB: ${recorded.size} contribution rows (all statuses).`);

  // 2) All successful signatures touching the presale USDC ATA (paginated).
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
  console.log(`On-chain: ${sigs.length} successful signatures touching the ATA.`);

  // 3) Inspect only the signatures NOT already recorded; compute the USDC
  //    credited to the presale ATA and the payer (fee payer === buyer).
  const toCheck = sigs.filter((s) => !recorded.has(s));
  console.log(`${toCheck.length} on-chain signatures are not in the DB — inspecting…\n`);

  const recipientUsdc = (list: TokenBalance[] | null | undefined) =>
    (list ?? []).find(
      (b) => b.mint === USDC_MINT_ADDRESS && b.owner === PRESALE_WALLET_ADDRESS,
    );

  type Row = { sig: string; payer: string; usdc: number; at: string };
  const unmatched: Row[] = [];
  const failedSigs: string[] = []; // RPC errored — NOT proven clean; must re-check
  const CHUNK = 8;
  for (let i = 0; i < toCheck.length; i += CHUNK) {
    const chunk = toCheck.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map((sig) =>
        connection
          .getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
          .then((tx) => ({ sig, tx, errored: false }))
          .catch(() => ({ sig, tx: null, errored: true })),
      ),
    );
    for (const { sig, tx, errored } of results) {
      // A dropped getParsedTransaction must NOT be silently treated as "no
      // credit" — it could be an unrecorded payment. Collect it and warn.
      if (errored) {
        failedSigs.push(sig);
        continue;
      }
      if (!tx || tx.meta?.err) continue;
      const pre = BigInt(recipientUsdc(tx.meta?.preTokenBalances)?.uiTokenAmount.amount ?? "0");
      const post = BigInt(recipientUsdc(tx.meta?.postTokenBalances)?.uiTokenAmount.amount ?? "0");
      const delta = post - pre;
      if (delta <= BigInt(0)) continue; // not a USDC credit to the presale wallet
      unmatched.push({
        sig,
        payer: tx.transaction.message.accountKeys[0]?.pubkey.toBase58() ?? "unknown",
        usdc: Number(delta) / 10 ** USDC_DECIMALS,
        at: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : "unknown",
      });
    }
    await sleep(150);
  }

  // 4) Report, oldest first.
  unmatched.sort((a, b) => a.at.localeCompare(b.at));
  console.log(`=== UNRECORDED on-chain USDC payments to the presale wallet: ${unmatched.length} ===`);
  let total = 0;
  for (const u of unmatched) {
    total += u.usdc;
    console.log(`${u.at}  ${u.usdc.toFixed(2)} USDC  from ${u.payer}  sig ${u.sig}`);
  }
  console.log(`\nTotal unrecorded: ${total.toFixed(2)} USDC across ${unmatched.length} payment(s).`);
  console.log("Recorded rows (incl. pending/flagged) are excluded. Verify each before crediting/refunding.");
  if (failedSigs.length) {
    console.log(
      `\n⚠ COULD NOT INSPECT ${failedSigs.length} signature(s) due to RPC errors — this report is NOT complete. Re-run (use a Helius SOLANA_RPC_URL, not the public RPC) to clear these:`,
    );
    for (const s of failedSigs) console.log(`  ${s}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
