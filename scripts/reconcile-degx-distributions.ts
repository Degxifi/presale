/**
 * Reconcile 'submitted' $DEGX distribution rows against the chain. A 'submitted'
 * row = we have a tx signature but never got a confirmation (RPC timeout, dropped
 * tx, throwing send that may or may not have landed). We NEVER auto-retry those
 * (could double-pay), so this script resolves them definitively:
 *
 *   - tx finalized OK on-chain   → 'confirmed'  (buyer got paid; done)
 *   - tx errored on-chain        → 'failed'     (re-claimable by the API/airdrop)
 *   - tx unknown after expiry    → 'failed'     (provably never landed → re-claimable)
 *   - tx still recent/unknown    → leave 'submitted' (might still be in flight)
 *
 * Run periodically during/after distribution.
 *   bun --env-file=.env.local run scripts/reconcile-degx-distributions.ts          # dry-run
 *   bun --env-file=.env.local run scripts/reconcile-degx-distributions.ts --live   # apply
 */
import postgres from "postgres";
import { Connection } from "@solana/web3.js";

const LIVE = process.argv.includes("--live");
const NOT_FOUND_FAIL_AFTER_MS = 10 * 60 * 1000; // unknown for >10min ⇒ never landed

const DB = process.env.DATABASE_URL;
const RPC = process.env.SOLANA_RPC_URL;
if (!DB) { console.error("DATABASE_URL not set"); process.exit(1); }
if (!RPC) { console.error("SOLANA_RPC_URL not set"); process.exit(1); }

const sql = postgres(DB, { prepare: false });
const conn = new Connection(RPC, "confirmed");

async function main() {
  const rows = (await sql`
    SELECT wallet, tranche, tx_sig, updated_at FROM degx_distributions WHERE status = 'submitted'
  `) as unknown as { wallet: string; tranche: number; tx_sig: string | null; updated_at: Date }[];

  console.log(`\n  ${LIVE ? "LIVE" : "DRY-RUN"} reconcile — ${rows.length} submitted row(s)\n`);
  let toConfirmed = 0, toFailed = 0, left = 0;

  for (const r of rows) {
    if (!r.tx_sig) {
      // 'submitted' with no sig should not happen, but if it does it's safe to fail.
      console.log(`  ${r.wallet.slice(0, 6)}… t${r.tranche}  no tx_sig → failed`);
      if (LIVE) await sql`UPDATE degx_distributions SET status='failed', error='submitted without tx_sig', updated_at=now() WHERE wallet=${r.wallet} AND tranche=${r.tranche} AND status='submitted'`;
      toFailed++; continue;
    }
    const st = (await conn.getSignatureStatuses([r.tx_sig], { searchTransactionHistory: true })).value[0];
    let action: "confirmed" | "failed" | "leave";
    let why: string;
    if (st) {
      if (st.err) { action = "failed"; why = `on-chain err ${JSON.stringify(st.err)}`; }
      else if (st.confirmationStatus === "finalized" || st.confirmationStatus === "confirmed") { action = "confirmed"; why = st.confirmationStatus; }
      else { action = "leave"; why = `status ${st.confirmationStatus ?? "processed"}`; }
    } else {
      const ageMs = Date.now() - new Date(r.updated_at).getTime();
      if (ageMs > NOT_FOUND_FAIL_AFTER_MS) { action = "failed"; why = `unknown for ${Math.round(ageMs / 60000)}m → never landed`; }
      else { action = "leave"; why = "unknown but recent"; }
    }

    console.log(`  ${r.wallet.slice(0, 6)}… t${r.tranche}  ${r.tx_sig.slice(0, 12)}…  → ${action.toUpperCase()}  (${why})`);
    if (LIVE && action === "confirmed") { await sql`UPDATE degx_distributions SET status='confirmed', error=NULL, updated_at=now() WHERE wallet=${r.wallet} AND tranche=${r.tranche} AND status='submitted'`; }
    if (LIVE && action === "failed") { await sql`UPDATE degx_distributions SET status='failed', error=${why}, updated_at=now() WHERE wallet=${r.wallet} AND tranche=${r.tranche} AND status='submitted'`; }
    if (action === "confirmed") toConfirmed++; else if (action === "failed") toFailed++; else left++;
  }

  console.log(`\n  ${LIVE ? "applied" : "would apply"}: →confirmed ${toConfirmed}  →failed(re-claimable) ${toFailed}  left submitted ${left}\n`);
  await sql.end();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
