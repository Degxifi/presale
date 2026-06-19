import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { isLikelyWalletAddress } from "@/lib/solana/config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  getWalletConfirmedRows,
  getDistribution,
  ensureDistributionsTable,
  claimDistribution,
  stampDistribution,
} from "@/lib/db/queries";
import { computeOwedWholeDegx, claimableForTranche, activeTranche, CLAIM_DOMAIN } from "@/lib/claim";
import {
  loadTreasuryKeypair,
  getMintCtx,
  treasuryAtaFor,
  buildRecipientIxns,
  sendIxns,
  toAtomic,
} from "@/lib/degx/transfer";

export const dynamic = "force-dynamic";

const MAX_MSG_AGE_MS = 10 * 60 * 1000; // 10-min freshness window

function parseClaimMessage(message: string): { wallet?: string; issuedMs?: number } {
  const wallet = message.match(/^Wallet:\s*(\S+)$/m)?.[1];
  const issued = message.match(/^Issued:\s*(\S+)$/m)?.[1];
  const issuedMs = issued ? Date.parse(issued) : NaN;
  return { wallet, issuedMs: Number.isNaN(issuedMs) ? undefined : issuedMs };
}

/**
 * Self-service $DEGX claim. The buyer signs a message proving they own the
 * connected wallet; the server verifies it, computes the wallet's exact owed
 * $DEGX from confirmed contributions, then the TREASURY (key in server env)
 * signs + sends it to that same wallet. Idempotent via the degx_distributions
 * ledger — a wallet can never be paid twice (shared with the airdrop script).
 *
 * Gated: returns 503 until DEGX_MINT + DEGX_TREASURY_PRIVATE_KEY are set (the
 * token must graduate + the treasury be funded first).
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!(await checkRateLimit(`claim:${ip}`))) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { wallet, message, signature } = (body ?? {}) as {
    wallet?: string;
    message?: string;
    signature?: string;
  };
  if (
    !isLikelyWalletAddress(wallet) ||
    typeof message !== "string" ||
    typeof signature !== "string" ||
    message.length > 512 ||
    signature.length > 128
  ) {
    return NextResponse.json({ error: "Missing or invalid claim fields." }, { status: 400 });
  }

  // 1. verify the ed25519 signature proves ownership of `wallet`
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet." }, { status: 400 });
  }
  let sigBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature encoding." }, { status: 400 });
  }
  if (sigBytes.length !== 64) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  const msgBytes = new TextEncoder().encode(message);
  if (!nacl.sign.detached.verify(msgBytes, sigBytes, pubkey.toBytes())) {
    return NextResponse.json({ error: "Signature does not match wallet." }, { status: 401 });
  }

  // 2. message must be our domain, bound to this wallet, and fresh (anti-replay)
  const parsed = parseClaimMessage(message);
  if (!message.startsWith(CLAIM_DOMAIN) || parsed.wallet !== wallet) {
    return NextResponse.json({ error: "Unexpected claim message." }, { status: 400 });
  }
  if (!parsed.issuedMs || Math.abs(Date.now() - parsed.issuedMs) > MAX_MSG_AGE_MS) {
    return NextResponse.json({ error: "Claim message expired — please sign again." }, { status: 400 });
  }

  // 3. how much is claimable in the currently-open tranche (40% now / 60% later)
  const tranche = activeTranche();
  const owed = claimableForTranche(computeOwedWholeDegx(await getWalletConfirmedRows(wallet)), tranche);
  if (owed <= 0) {
    return NextResponse.json({ error: "This wallet has no $DEGX allocation." }, { status: 404 });
  }

  // 4. cheap ledger pre-check (no RPC) for already-claimed / in-flight
  const pre = await getDistribution(wallet, tranche);
  if (pre?.status === "confirmed") {
    return NextResponse.json({ ok: true, alreadyClaimed: true, amount: owed, sig: pre.txSig });
  }
  if (pre?.status === "pending" || pre?.status === "submitted") {
    return NextResponse.json({ error: "A claim for this wallet is already in progress." }, { status: 409 });
  }

  // 5. gate: token live + treasury configured?
  const mintAddr = process.env.DEGX_MINT;
  const secret = process.env.DEGX_TREASURY_PRIVATE_KEY;
  const rpc = process.env.SOLANA_RPC_URL;
  if (!mintAddr || !secret || !rpc) {
    return NextResponse.json({ error: "Claiming opens at token graduation." }, { status: 503 });
  }

  try {
    await ensureDistributionsTable();
    const conn = new Connection(rpc, "confirmed");
    const treasury = loadTreasuryKeypair(secret);
    const ctx = await getMintCtx(conn, mintAddr);
    const tAta = treasuryAtaFor(ctx, treasury.publicKey);

    // pre-flight: treasury holds enough $DEGX for this claim
    const bal = (await getAccount(conn, tAta, "confirmed", ctx.programId)).amount;
    if (bal < toAtomic(owed, ctx.decimals)) {
      return NextResponse.json({ error: "Treasury temporarily out of funds — try again soon." }, { status: 503 });
    }
    // pre-flight: treasury SOL for the recipient ATA rent (~0.002) + fee. A
    // SOL-dry treasury would make every send throw → endless retry; 503 instead.
    if ((await conn.getBalance(treasury.publicKey, "confirmed")) < 3_000_000) {
      return NextResponse.json({ error: "Treasury temporarily unavailable — try again soon." }, { status: 503 });
    }

    // 6. atomic claim (race-safe). Anything but "claimed" means we lost the race.
    const claim = await claimDistribution(wallet, tranche, owed);
    if (claim === "already") {
      const d = await getDistribution(wallet, tranche);
      return NextResponse.json({ ok: true, alreadyClaimed: true, amount: owed, sig: d?.txSig });
    }
    if (claim === "inflight") {
      return NextResponse.json({ error: "A claim for this wallet is already in progress." }, { status: 409 });
    }

    // 7. send + stamp
    const result = await sendIxns(conn, treasury, buildRecipientIxns(ctx, treasury.publicKey, pubkey, owed), {
      cuLimit: 200_000,
      priorityAccounts: [tAta],
    });

    if (result.sig && result.confirmed) {
      await stampDistribution(wallet, tranche, "confirmed", result.sig, null);
      return NextResponse.json({ ok: true, amount: owed, sig: result.sig });
    }
    if (result.sig && !result.confirmed) {
      // submitted but unconfirmed → park for manual review; never auto-retry.
      await stampDistribution(wallet, tranche, "submitted", result.sig, result.error ?? null);
      return NextResponse.json(
        { ok: false, pending: true, amount: owed, sig: result.sig, error: "Submitted but not yet confirmed — check Solscan; don't re-claim." },
        { status: 202 },
      );
    }
    // never submitted → safe to retry
    await stampDistribution(wallet, tranche, "failed", null, result.error ?? "unknown");
    return NextResponse.json({ error: "Claim transaction failed — please try again." }, { status: 502 });
  } catch (e) {
    // after a claim row may be 'pending'; leave it for manual review rather than
    // risk a double-send (we don't know if a tx went out).
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Claim failed unexpectedly." },
      { status: 500 },
    );
  }
}
