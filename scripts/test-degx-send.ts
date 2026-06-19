/**
 * TEST-ONLY: send a token from the treasury to ONE wallet, using the SAME
 * on-chain code path as the real claim/airdrop (lib/degx/transfer.ts) — but with
 * NO database and NO ledger. Use it to prove your treasury key + token work
 * end-to-end before the real $DEGX exists.
 *
 *   Reads env:  SOLANA_RPC_URL, DEGX_MINT, DEGX_TREASURY_PRIVATE_KEY
 *   (point SOLANA_RPC_URL at devnet — https://api.devnet.solana.com — to test
 *    for free; or mainnet with a throwaway token + tiny amounts.)
 *
 *   Usage:
 *     bun --env-file=.env.local run scripts/test-degx-send.ts <recipientWallet> <amount>
 *   Example (send 1,000 test tokens to a wallet you control):
 *     bun --env-file=.env.local run scripts/test-degx-send.ts 7xK9...q2Ab 1000
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import {
  loadTreasuryKeypair,
  getMintCtx,
  treasuryAtaFor,
  sendDegx,
} from "@/lib/degx/transfer";

const die = (m: string): never => { console.error(`\n  ABORT: ${m}\n`); process.exit(1); };

const [recipientArg, amountArg] = process.argv.slice(2);
if (!recipientArg || !amountArg) die("usage: test-degx-send.ts <recipientWallet> <amount>");

const RPC = process.env.SOLANA_RPC_URL;
const MINT = process.env.DEGX_MINT;
const SECRET = process.env.DEGX_TREASURY_PRIVATE_KEY;
if (!RPC) die("SOLANA_RPC_URL not set (use a devnet RPC to test for free).");
if (!MINT) die("DEGX_MINT not set (your test token's mint address).");
if (!SECRET) die("DEGX_TREASURY_PRIVATE_KEY not set (the treasury wallet's secret key).");

let recipient: PublicKey;
try { recipient = new PublicKey(recipientArg!); } catch { die("recipient is not a valid wallet address."); }
const amount = Number(amountArg);
if (!Number.isFinite(amount) || amount <= 0) die("amount must be a positive number.");

async function main() {
  const conn = new Connection(RPC!, "confirmed");
  const treasury = loadTreasuryKeypair(SECRET!);
  const ctx = await getMintCtx(conn, MINT!);
  const tAta = treasuryAtaFor(ctx, treasury.publicKey);

  console.log(`\n  TEST SEND (no DB, no ledger)`);
  console.log(`  ──────────────────────────────`);
  console.log(`  rpc:       ${RPC}`);
  console.log(`  treasury:  ${treasury.publicKey.toBase58()}`);
  console.log(`  token:     ${MINT}  (decimals ${ctx.decimals}, ${ctx.programId.toBase58()})`);
  try {
    const bal = (await getAccount(conn, tAta, "confirmed", ctx.programId)).amount;
    console.log(`  balance:   ${(bal / BigInt(10) ** BigInt(ctx.decimals)).toLocaleString("en-US")} tokens`);
  } catch { die(`treasury has no token account for this mint (${tAta.toBase58()}). Mint/fund it first.`); }
  console.log(`  → sending ${amount.toLocaleString("en-US")} to ${recipient!.toBase58()}\n`);

  const result = await sendDegx(conn, treasury, ctx, recipient!, amount);
  if (result.sig && result.confirmed) {
    console.log(`  ✓ confirmed · ${result.sig}`);
    console.log(`  explorer: https://solscan.io/tx/${result.sig}  (append ?cluster=devnet if on devnet)\n`);
  } else if (result.sig) {
    console.log(`  ⚠ submitted but not confirmed · ${result.sig}  (${result.error})\n`);
  } else {
    console.log(`  ✗ failed: ${result.error}\n`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
