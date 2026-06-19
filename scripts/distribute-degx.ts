/**
 * $DEGX presale distribution (airdrop) — push every presale buyer the $DEGX they
 * are owed, from a treasury wallet, on Solana mainnet. The "push" counterpart to
 * the self-service /claim page (both share the degx_distributions ledger, so a
 * wallet can never be paid by both).
 *
 *   Owes:  per wallet = SUM over confirmed rows of floor(amount_usdc / tier_price)
 *          — whole $DEGX, matching the admin CSV (pending/flagged rows get nothing).
 *
 * ── SAFETY ──────────────────────────────────────────────────────────────────
 *   • DRY-RUN BY DEFAULT — prints the plan, sends nothing unless you pass --live.
 *   • Live mode refuses unless DEGX_MINT + DEGX_TREASURY_PRIVATE_KEY are set.
 *   • Pre-flights treasury $DEGX + SOL (ATA rents); aborts if short.
 *   • Idempotent ledger: confirmed wallets skipped forever; submitted-but-
 *     unconfirmed parked for MANUAL review (never auto-retried).
 *
 * ── ENV (from .env.local) ─────────────────────────────────────────────────────
 *   DATABASE_URL                presale Supabase DB (contributions + ledger)
 *   DEGX_MINT                   $DEGX SPL mint (exists post-graduation)
 *   DEGX_TREASURY_PRIVATE_KEY   base58 secret of the wallet holding the $DEGX
 *   SOLANA_RPC_URL              RPC with provider key
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────────
 *   bun --env-file=.env.local run scripts/distribute-degx.ts                # dry-run
 *   bun --env-file=.env.local run scripts/distribute-degx.ts --live --limit 1   # canary
 *   bun --env-file=.env.local run scripts/distribute-degx.ts --live          # everyone
 *   Flags: --live  --limit N  --batch N (recipients/tx, default 5)  --only <wallet>
 */
import postgres from "postgres";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { aggregateOwedByWallet, claimableForTranche, activeTranche } from "@/lib/claim";
import {
  loadTreasuryKeypair,
  getMintCtx,
  treasuryAtaFor,
  buildRecipientIxns,
  sendIxns,
  toAtomic,
} from "@/lib/degx/transfer";

const ARGV = process.argv.slice(2);
const LIVE = ARGV.includes("--live");
const flag = (name: string) => {
  const i = ARGV.indexOf(name);
  return i >= 0 ? ARGV[i + 1] : undefined;
};
const LIMIT = flag("--limit") ? Number(flag("--limit")) : Infinity;
const BATCH = flag("--batch") ? Math.max(1, Number(flag("--batch"))) : 5;
const ONLY = flag("--only");
const TRANCHE = flag("--tranche") ? Number(flag("--tranche")) : activeTranche(); // 1=40% now, 2=60% later

const log = (...a: unknown[]) => console.log(...a);
const die = (msg: string): never => {
  console.error(`\n  ABORT: ${msg}\n`);
  process.exit(1);
};

const DB = process.env.DATABASE_URL;
if (!DB) die("DATABASE_URL is not set (run with --env-file=.env.local).");
const sql = postgres(DB!, { prepare: false });

type Recipient = { wallet: string; amount: number; pubkey: PublicKey };

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS degx_distributions (
      wallet text NOT NULL, tranche smallint NOT NULL DEFAULT 1, degx_amount numeric(30,0) NOT NULL,
      status text NOT NULL DEFAULT 'pending', tx_sig text, error text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (wallet, tranche)
    )`;

  const contribRows = (await sql`
    SELECT wallet, tier, amount_usdc AS "amountUsdc" FROM contributions WHERE status = 'confirmed'
  `) as unknown as { wallet: string; tier: number; amountUsdc: string }[];
  const owed = aggregateOwedByWallet(contribRows);

  const ledger = (await sql`SELECT wallet, status, tx_sig, updated_at FROM degx_distributions WHERE tranche = ${TRANCHE}`) as unknown as {
    wallet: string;
    status: string;
    tx_sig: string | null;
    updated_at: Date;
  }[];
  const ledgerBy = new Map(ledger.map((l) => [l.wallet, l]));
  const STALE_MS = 5 * 60 * 1000;

  const done: string[] = [];
  const manual: string[] = [];
  const todo: Recipient[] = [];
  const invalid: string[] = [];

  for (const [wallet, fullAmount] of owed) {
    if (ONLY && wallet !== ONLY) continue;
    const amount = claimableForTranche(fullAmount, TRANCHE); // matches the /claim page for this tranche
    if (amount <= 0) continue;
    const l = ledgerBy.get(wallet);
    if (l?.status === "confirmed") { done.push(wallet); continue; }
    if (l?.status === "submitted") { manual.push(wallet); continue; }
    if (l?.status === "pending") {
      // A 'pending' WITH a tx_sig, or a fresh one, is genuinely in-flight → manual.
      // A stale 'pending' that never produced a tx_sig is an orphaned crash → let
      // it fall through to todo; the atomic claim below will reclaim it.
      const stale = l.tx_sig == null && new Date(l.updated_at).getTime() < Date.now() - STALE_MS;
      if (!stale) { manual.push(wallet); continue; }
    }
    let pubkey: PublicKey;
    try { pubkey = new PublicKey(wallet); } catch { invalid.push(wallet); continue; }
    todo.push({ wallet, amount, pubkey });
  }
  todo.sort((a, b) => a.wallet.localeCompare(b.wallet));
  const work = Number.isFinite(LIMIT) ? todo.slice(0, LIMIT) : todo;

  const totalOwed = [...owed.values()].reduce((s, n) => s + claimableForTranche(n, TRANCHE), 0);
  const toSendDegx = work.reduce((s, r) => s + r.amount, 0);

  log(`\n  $DEGX distribution — ${LIVE ? "LIVE" : "DRY-RUN"} · tranche ${TRANCHE}${ONLY ? `  (only ${ONLY})` : ""}`);
  log(`  ─────────────────────────────────────────────`);
  log(`  recipients (confirmed):       ${owed.size}  (${totalOwed.toLocaleString("en-US")} $DEGX · tranche ${TRANCHE})`);
  log(`  already distributed:          ${done.length}`);
  log(`  to distribute this run:        ${work.length}  (${toSendDegx.toLocaleString("en-US")} $DEGX)`);
  if (work.length < todo.length) log(`    (capped by --limit; ${todo.length - work.length} more pending)`);
  if (manual.length) log(`  ⚠ MANUAL REVIEW (submitted/in-flight): ${manual.length}  — ${manual.slice(0, 5).join(", ")}${manual.length > 5 ? " …" : ""}`);
  if (invalid.length) log(`  ⚠ invalid wallet addresses:    ${invalid.length}`);

  if (work.length === 0) {
    log(`\n  Nothing to distribute.\n`);
    await sql.end();
    process.exit(0);
  }

  if (!LIVE) {
    log(`\n  Dry-run — nothing sent. Re-run with --live (and DEGX_MINT + DEGX_TREASURY_PRIVATE_KEY set).`);
    log(`  Tip: start with --live --limit 1 (or --only <wallet>) as a canary.\n`);
    await sql.end();
    process.exit(0);
  }

  const MINT = process.env.DEGX_MINT;
  const SECRET = process.env.DEGX_TREASURY_PRIVATE_KEY;
  const RPC = process.env.SOLANA_RPC_URL;
  if (!MINT) die("DEGX_MINT is not set — refusing to send.");
  if (!SECRET) die("DEGX_TREASURY_PRIVATE_KEY is not set — refusing to send.");
  if (!RPC) die("SOLANA_RPC_URL is not set.");

  const conn = new Connection(RPC!, "confirmed");
  let treasury;
  try { treasury = loadTreasuryKeypair(SECRET!); }
  catch { return die("DEGX_TREASURY_PRIVATE_KEY is not valid base58."); }

  let ctx;
  try { ctx = await getMintCtx(conn, MINT!); }
  catch (e) { return die(String(e instanceof Error ? e.message : e)); }
  const treasuryAta = treasuryAtaFor(ctx, treasury.publicKey);

  let haveAtomic: bigint;
  try { haveAtomic = (await getAccount(conn, treasuryAta, "confirmed", ctx.programId)).amount; }
  catch { return die(`Treasury has no $DEGX token account (${treasuryAta.toBase58()}). Fund it first.`); }
  const needAtomic = toAtomic(toSendDegx, ctx.decimals);
  log(`\n  treasury ${treasury.publicKey.toBase58()}`);
  log(`  $DEGX decimals: ${ctx.decimals} · program: ${ctx.programId.toBase58()}`);
  log(`  balance: ${(haveAtomic / BigInt(10) ** BigInt(ctx.decimals)).toLocaleString("en-US")} $DEGX · need: ${toSendDegx.toLocaleString("en-US")}`);
  if (haveAtomic < needAtomic) die(`Treasury $DEGX short by ${((needAtomic - haveAtomic) / BigInt(10) ** BigInt(ctx.decimals)).toLocaleString("en-US")}.`);

  const sol = await conn.getBalance(treasury.publicKey, "confirmed");
  const estSol = Math.ceil(work.length * 0.0021 * 1e9) + 5_000_000;
  log(`  treasury SOL: ${(sol / 1e9).toFixed(4)} · est need: ~${(estSol / 1e9).toFixed(4)}`);
  if (sol < estSol) die(`Treasury SOL too low for ATA rents/fees (need ~${(estSol / 1e9).toFixed(4)} SOL).`);

  log(`\n  Sending in batches of ${BATCH}…\n`);
  let confirmed = 0, failed = 0, submitted = 0;

  for (let i = 0; i < work.length; i += BATCH) {
    const batch = work.slice(i, i + BATCH);

    // Atomically CLAIM each wallet (same rule as the /api/claim path) and send
    // ONLY the wallets this run actually won. A wallet concurrently self-claimed
    // (or already paid) returns no row → we skip it instead of DOUBLE-PAYING.
    const claimedBatch: Recipient[] = [];
    for (const r of batch) {
      const won = await sql`
        INSERT INTO degx_distributions (wallet, tranche, degx_amount, status)
        VALUES (${r.wallet}, ${TRANCHE}, ${r.amount}, 'pending')
        ON CONFLICT (wallet, tranche) DO UPDATE SET status = 'pending', degx_amount = EXCLUDED.degx_amount, error = NULL, updated_at = now()
        WHERE degx_distributions.status = 'failed'
           OR (degx_distributions.status = 'pending' AND degx_distributions.tx_sig IS NULL AND degx_distributions.updated_at < now() - interval '5 minutes')
        RETURNING wallet`;
      if (won.length > 0) claimedBatch.push(r);
    }
    const skipped = batch.length - claimedBatch.length;
    if (skipped > 0) log(`  ↪ skipped ${skipped} already-claimed/in-flight wallet(s) this batch`);
    if (claimedBatch.length === 0) continue;
    const wallets = claimedBatch.map((b) => b.wallet);

    const recipientIxns = claimedBatch.flatMap((r) => buildRecipientIxns(ctx, treasury.publicKey, r.pubkey, r.amount));
    const result = await sendIxns(conn, treasury, recipientIxns, { priorityAccounts: [treasuryAta] });

    // All stamps are scoped to wallets this run set to 'pending' (AND status='pending'),
    // so a concurrent self-claim's 'confirmed' row can never be overwritten.
    if (result.sig && result.confirmed) {
      await sql`UPDATE degx_distributions SET status='confirmed', tx_sig=${result.sig}, error=NULL, updated_at=now() WHERE wallet = ANY(${wallets}) AND tranche = ${TRANCHE} AND status='pending'`;
      confirmed += claimedBatch.length;
      log(`  ✓ [${i + batch.length}/${work.length}] ${claimedBatch.length} sent · ${result.sig}`);
    } else if (result.sig) {
      // submitted-but-unconfirmed (or a throwing send that may have landed) →
      // never auto-retry; reconcile on-chain with reconcile-degx-distributions.ts.
      await sql`UPDATE degx_distributions SET status='submitted', tx_sig=${result.sig}, error=${result.error ?? null}, updated_at=now() WHERE wallet = ANY(${wallets}) AND tranche = ${TRANCHE} AND status='pending'`;
      submitted += claimedBatch.length;
      log(`  ⚠ [${i + batch.length}/${work.length}] submitted-unconfirmed · ${result.sig} — RECONCILE`);
    } else {
      await sql`UPDATE degx_distributions SET status='failed', error=${result.error ?? "unknown"}, updated_at=now() WHERE wallet = ANY(${wallets}) AND tranche = ${TRANCHE} AND status='pending'`;
      failed += claimedBatch.length;
      log(`  ✗ [${i + batch.length}/${work.length}] failed (${result.error}) — will retry next run`);
    }
  }

  log(`\n  Done. confirmed=${confirmed}  failed=${failed}  submitted-unconfirmed=${submitted}\n`);
  await sql.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
