/**
 * $DEGX token distribution — env-key signer (no wallet prompts).
 *
 * The dashboard flow (admin connects a wallet) needs one approval per ~32
 * wallets; for hundreds of recipients that's many clicks. This script signs every
 * transaction with a key from the environment instead, so a full tranche goes out
 * in one command. It shares the EXACT same library and the same `distributions`
 * ledger as the in-app feature, so the two can't double-pay — re-running, or
 * mixing script + dashboard, is always exactly-once.
 *
 * Env (use --env-file=.env.local):
 *   DEGX_DISTRIBUTOR_SECRET_KEY  treasury secret — base58 OR a JSON byte array.
 *                                Its wallet must hold the $DEGX + SOL. SECRET:
 *                                keep it out of shell history and shared hosts.
 *   SOLANA_RPC_URL               Helius (not the public RPC).
 *   DATABASE_URL                 same DB the app uses (ledger + master list).
 *
 * Usage:
 *   bun --env-file=.env.local run scripts/distribute.ts --dry            # preview
 *   bun --env-file=.env.local run scripts/distribute.ts --unlock 40      # TGE
 *   bun --env-file=.env.local run scripts/distribute.ts --unlock 100 --yes
 * Flags: --unlock <pct=40> --dry --yes(skip prompt) --limit <n> --mint <addr>
 *        --wave <batchesPerBlockhash=20> --batch-size <transfersPerTx=8>
 *        --priority <microLamports=20000> --rpc <url>
 */
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  ATA_RENT_LAMPORTS,
  BATCH_SIZE,
  type BatchRecipient,
  buildUnsignedBatch,
  classifySignatures,
  degxAta,
  fetchMissingAtas,
  formatTokens,
} from "@/lib/solana/distribute";
import { buildPlan, type PlanRecipient, reconcileInflight } from "@/lib/distribution";
import {
  clearInflight,
  commitConfirmed,
  getSettings,
  setInflight,
} from "@/lib/db/queries";
import { db } from "@/lib/db";

// ---- args --------------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = new Map<string, string | true>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (!a.startsWith("--")) continue;
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith("--")) (flags.set(a.slice(2), next), i++);
  else flags.set(a.slice(2), true);
}
const has = (k: string) => flags.has(k);
const str = (k: string, d = "") => (typeof flags.get(k) === "string" ? (flags.get(k) as string) : d);
const num = (k: string, d: number) => (typeof flags.get(k) === "string" ? Number(flags.get(k)) : d);

const DRY = has("dry");
const YES = has("yes");
const UNLOCK = num("unlock", 40);
const WAVE = Math.max(1, num("wave", 20)); // txs per fresh blockhash window
const BATCH = Math.max(1, Math.min(BATCH_SIZE, num("batch-size", BATCH_SIZE)));
const PRIORITY = num("priority", 20_000);
const LIMIT = has("limit") ? num("limit", 0) : undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sol = (lamports: number | bigint) => (Number(lamports) / 1e9).toFixed(3);
function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
function loadKeypair(secret: string): Keypair {
  const t = secret.trim();
  try {
    return Keypair.fromSecretKey(t.startsWith("[") ? Uint8Array.from(JSON.parse(t)) : bs58.decode(t));
  } catch {
    throw new Error("DEGX_DISTRIBUTOR_SECRET_KEY must be base58 or a JSON byte array.");
  }
}
const die = (m: string): never => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

async function main() {
  if (!db) die("DATABASE_URL is not set — run with --env-file=.env.local");
  if (!Number.isFinite(UNLOCK) || UNLOCK <= 0 || UNLOCK > 100) die("--unlock must be 1..100");
  const unlockBps = Math.round(UNLOCK * 100);

  const secret = process.env.DEGX_DISTRIBUTOR_SECRET_KEY;
  if (!secret) die("DEGX_DISTRIBUTOR_SECRET_KEY is not set.");
  const payer = loadKeypair(secret!);

  const RPC = str("rpc", process.env.SOLANA_RPC_URL || "");
  if (!RPC) console.warn("⚠ SOLANA_RPC_URL not set — using public RPC (will rate-limit).");
  const c = new Connection(RPC || "https://api.mainnet-beta.solana.com", "confirmed");

  const mintStr = str("mint") || (await getSettings()).degxMint;
  if (!mintStr) die("No $DEGX mint — set it in the dashboard or pass --mint <addr>.");
  let mint: PublicKey;
  try {
    mint = new PublicKey(mintStr!);
  } catch {
    return die(`Invalid mint address: ${mintStr}`);
  }

  // Plan (reconciles in-flight first → heals a prior interrupted run).
  const plan = await buildPlan(c, mint, unlockBps);
  const dec = plan.decimals;
  let recipients: PlanRecipient[] = plan.recipients;
  if (LIMIT !== undefined) recipients = recipients.slice(0, LIMIT);
  const runOwed = recipients.reduce((a, r) => a + r.owed, 0n);

  // Treasury holdings + work to do.
  const sourceAta = degxAta(mint, payer.publicKey, plan.programId);
  const [tokenBal, lamports] = await Promise.all([
    c.getTokenAccountBalance(sourceAta).then((r) => BigInt(r.value.amount)).catch(() => 0n),
    c.getBalance(payer.publicKey),
  ]);
  const owners = recipients.map((r) => new PublicKey(r.wallet));
  const missing = await fetchMissingAtas(c, mint, owners, plan.programId);
  const batches = chunk(recipients, BATCH);
  const solNeed = missing.size * ATA_RENT_LAMPORTS + batches.length * 5000; // rent + ~fees

  const prog = plan.programId.toBase58().startsWith("Tokenz") ? "Token-2022" : "SPL Token";
  const enoughToken = tokenBal >= runOwed;
  const enoughSol = lamports >= solNeed;

  console.log(`\n== $DEGX distribution${DRY ? " — DRY RUN" : ""} ==`);
  console.log(`Distributor : ${payer.publicKey.toBase58()}`);
  console.log(`Mint        : ${mint.toBase58()} (${prog}, ${dec}d${plan.transferFeeBps ? `, fee ${plan.transferFeeBps / 100}%` : ""})`);
  console.log(`Unlock      : ${UNLOCK}%   Already distributed: ${formatTokens(plan.distributedTotal, dec)}`);
  console.log(`Recipients  : ${recipients.length}${LIMIT !== undefined ? ` (limited from ${plan.recipients.length})` : ""}`);
  console.log(`Owed (run)  : ${formatTokens(runOwed, dec)} $DEGX`);
  console.log(`Treasury    : ${formatTokens(tokenBal, dec)} $DEGX ${enoughToken ? "✓" : `✗ short ${formatTokens(runOwed - tokenBal, dec)}`}  |  ${sol(lamports)} SOL ${enoughSol ? "✓" : `✗ need ~${sol(solNeed)}`}`);
  console.log(`Plan        : ${batches.length} txs in ${Math.ceil(batches.length / WAVE)} wave(s), ${missing.size} new ATAs (~${sol(missing.size * ATA_RENT_LAMPORTS)} SOL rent)`);
  if (plan.transferFeeBps > 0)
    console.log(`  ⚠ transfer-fee mint — recipients receive less than the amounts shown (amounts are pre-fee).`);
  for (const r of recipients.slice(0, 8))
    console.log(`    ${r.wallet}  ${formatTokens(r.owed, dec)}`);
  if (recipients.length > 8) console.log(`    …and ${recipients.length - 8} more`);

  if (runOwed === 0n) {
    console.log("\nEveryone is at this unlock — nothing to send.");
    process.exit(0);
  }
  if (DRY) {
    console.log("\nDRY RUN — nothing signed or sent. Re-run without --dry to execute.");
    process.exit(enoughToken && enoughSol ? 0 : 1);
  }
  if (!enoughToken) die(`Treasury is short ${formatTokens(runOwed - tokenBal, dec)} $DEGX — fund it and retry.`);
  if (!enoughSol) die(`Treasury needs ~${sol(solNeed)} SOL for fees + ATA rent — fund it and retry.`);

  if (!YES) {
    const ans = prompt(`\nSend ${formatTokens(runOwed, dec)} $DEGX to ${recipients.length} wallet(s) from ${payer.publicKey.toBase58()}? type "yes": `);
    if (ans?.trim().toLowerCase() !== "yes") die("Aborted.");
  }

  // ---- waves: build → sign(env key) → WAL → broadcast → confirm → commit -----
  let confirmed = 0;
  let failed = 0;
  const waveCount = Math.ceil(batches.length / WAVE);
  for (let w = 0; w < batches.length; w += WAVE) {
    const waveNo = Math.floor(w / WAVE) + 1;
    const slice = batches.slice(w, w + WAVE);
    const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");

    const built = slice.map((batch, k) => {
      const recs: BatchRecipient[] = batch.map((r) => {
        const owner = new PublicKey(r.wallet);
        return {
          owner,
          amount: r.owed,
          needsAta: missing.has(degxAta(mint, owner, plan.programId).toBase58()),
        };
      });
      const tx = buildUnsignedBatch({
        payer: payer.publicKey,
        mint,
        sourceAta,
        decimals: dec,
        programId: plan.programId,
        recipients: recs,
        blockhash,
        priorityMicroLamports: PRIORITY,
      });
      tx.sign([payer]); // env key signs — no prompt
      return { idx: w + k, sig: bs58.encode(tx.signatures[0]!), tx, items: batch };
    });

    // Write-ahead log BEFORE broadcasting (atomic claim; guards double-send).
    try {
      await setInflight(
        built.flatMap((b) =>
          b.items.map((r) => ({
            wallet: r.wallet,
            amount: r.owed.toString(),
            sig: b.sig,
            lvbh: lastValidBlockHeight,
            target: r.target.toString(),
          })),
        ),
      );
    } catch (e) {
      console.warn(`  wave ${waveNo}/${waveCount}: WAL claim rejected (${e instanceof Error ? e.message : e}); skipping — reconcile will heal.`);
      continue;
    }

    await Promise.all(
      built.map((b) =>
        c
          .sendRawTransaction(b.tx.serialize(), { skipPreflight: false, maxRetries: 5 })
          .catch((e) => console.warn(`  batch ${b.idx + 1} send error: ${e instanceof Error ? e.message : e}`)),
      ),
    );

    // Confirm the whole wave with ONE batched status poll (no per-tx polling).
    const sigs = built.map((b) => ({ sig: b.sig, lvbh: lastValidBlockHeight }));
    let statuses = await classifySignatures(c, sigs);
    for (let t = 0; t < 45 && [...statuses.values()].includes("pending"); t++) {
      await sleep(2000);
      statuses = await classifySignatures(c, sigs);
    }
    const ok = [...statuses].filter(([, s]) => s === "confirmed").map(([s]) => s);
    const dead = [...statuses].filter(([, s]) => s === "failed" || s === "expired").map(([s]) => s);
    if (ok.length) await commitConfirmed(ok);
    if (dead.length) await clearInflight(dead);
    for (const b of built) (statuses.get(b.sig) === "confirmed" ? (confirmed += b.items.length) : (failed += b.items.length));
    console.log(`  wave ${waveNo}/${waveCount}: ${ok.length}/${built.length} batches confirmed (${confirmed} wallets total)`);
  }

  await reconcileInflight(c); // sweep any late landers into the ledger
  console.log(`\nDone — confirmed ${confirmed} wallet(s)${failed ? `, ${failed} not confirmed (still owed; re-run to retry safely)` : ""}.`);
  process.exit(failed ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
