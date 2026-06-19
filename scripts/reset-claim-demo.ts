/**
 * DEMO helper: reset a wallet's claim so /claim shows the "Claim" button again.
 * Deletes the wallet's degx_distributions ledger row(s) (test data only). After
 * running, REFRESH /claim and you can claim again.
 *
 *   bun --env-file=.env.local run scripts/reset-claim-demo.ts <wallet> [tranche]
 *
 * Examples:
 *   bun --env-file=.env.local run scripts/reset-claim-demo.ts 3ThsEsMYcwWqWsrBWt2tVwQZp9guv3B1LHL6ADfrZSgg
 *   bun --env-file=.env.local run scripts/reset-claim-demo.ts <wallet> 1   # just tranche 1
 *
 * ⚠️ Before the REAL $DEGX launch, clear ALL demo rows so real claims start fresh:
 *     DELETE FROM degx_distributions;   (or use --all below)
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const [arg, trancheArg] = process.argv.slice(2);
if (!arg) {
  console.error("usage: reset-claim-demo.ts <wallet> [tranche]   (or --all to wipe every demo row)");
  process.exit(1);
}
const url = readFileSync("./.env.local", "utf8")
  .match(/^\s*DATABASE_URL\s*=(.*)$/m)![1]
  .trim()
  .replace(/^["']|["']$/g, "");
const sql = postgres(url, { prepare: false });

async function main() {
  let res;
  if (arg === "--all") {
    res = await sql`DELETE FROM degx_distributions RETURNING wallet`;
    console.log(`Cleared the entire degx_distributions ledger: ${res.length} row(s) removed.`);
  } else if (trancheArg) {
    res = await sql`DELETE FROM degx_distributions WHERE wallet = ${arg} AND tranche = ${Number(trancheArg)} RETURNING tranche`;
    console.log(`Reset ${res.length} claim row(s) for ${arg} (tranche ${trancheArg}).`);
  } else {
    res = await sql`DELETE FROM degx_distributions WHERE wallet = ${arg} RETURNING tranche`;
    console.log(`Reset ${res.length} claim row(s) for ${arg}.`);
  }
  console.log("→ Refresh /claim — the Claim button is back.");
  await sql.end();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
