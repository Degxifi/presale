import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import {
  PRESALE_WALLET_ADDRESS,
  isLikelyTxSignature,
  isLikelyWalletAddress,
  isPresaleConfigured,
} from "@/lib/solana/config";
import { verifyUsdcContribution } from "@/lib/solana/verify";
import {
  computeTierProgress,
  getPresalePhase,
  getTier,
  isTierEligible,
  resolvePresaleStart,
  tierUsdcCeiling,
} from "@/lib/presale";
import {
  getRaisedByTier,
  getSettings,
  recordContributionWithCap,
} from "@/lib/db/queries";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import type { TierId } from "@/types/presale";

/**
 * Record a confirmed contribution. The amount is taken from the ON-CHAIN
 * transaction (verified here), never trusted from the client.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!(await checkRateLimit(`contrib:${ip}`))) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 },
    );
  }

  if (!isPresaleConfigured()) {
    return NextResponse.json(
      { error: "Presale wallet is not configured." },
      { status: 503 },
    );
  }

  // The site is public — anyone can buy the Public Presale. The signed access
  // cookie (set from a Degxifi dashboard link) only UNLOCKS the earlier rounds;
  // read it here and enforce per-tier below. expectCookie: only a value WE
  // minted is accepted (not a raw entry token pasted in as a cookie).
  const cookieStore = await cookies();
  const access = await verifyAccessToken(cookieStore.get(ACCESS_COOKIE)?.value, {
    expectCookie: true,
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { wallet, tier, txSig } = (body ?? {}) as {
    wallet?: string;
    tier?: number;
    txSig?: string;
  };
  if (
    typeof wallet !== "string" ||
    typeof txSig !== "string" ||
    typeof tier !== "number" ||
    ![1, 2, 3].includes(tier)
  ) {
    return NextResponse.json(
      { error: "Missing or invalid fields." },
      { status: 400 },
    );
  }
  // Validate base58 shape BEFORE any DB/RPC work, so arbitrary strings never
  // reach the DB query or the RPC provider (and we don't leak provider errors).
  if (!isLikelyWalletAddress(wallet) || !isLikelyTxSignature(txSig)) {
    return NextResponse.json(
      { error: "Invalid wallet or transaction signature." },
      { status: 400 },
    );
  }

  const t = getTier(tier as TierId);

  // Enforce what the tier cards promise, server-side — checked BEFORE the
  // on-chain lookup so out-of-band submissions fail fast: the tier must be
  // OPEN (launch time + admin overrides), and round 1 (Early Believers) is
  // reserved for tier-1 members (D-VIP/D-Pro 3-6). Uses the lightweight
  // SQL-aggregated per-tier totals (not a full-table fetch) on this hot path.
  const [raisedByTier, settings] = await Promise.all([
    getRaisedByTier(),
    getSettings(),
  ]);
  const phase = getPresalePhase(resolvePresaleStart(settings.presaleStart));
  const progress = computeTierProgress(raisedByTier, phase, settings.tierOverrides);
  const tierStatus = progress.find((p) => p.tierId === t.id)?.status;
  // "active" accepts new buys. "paused" still RECORDS: by the time this runs
  // the USDC has already moved on-chain, and silently dropping the row (the
  // payment can't be dropped) is the worse failure — an admin pause mid-flight
  // must not erase a paid contribution. Pre-launch/closed/ended stay rejected.
  if (tierStatus !== "active" && tierStatus !== "paused") {
    return NextResponse.json(
      { error: `${t.name} is not open for contributions right now.` },
      { status: 400 },
    );
  }
  // Rounds 1 & 2 require a Degxifi member cookie; Public (3) is open to anyone.
  if ((t.id === 1 || t.id === 2) && !access) {
    return NextResponse.json(
      {
        error:
          "This round is for Degxifi members — open the presale from your dashboard, or buy in the Public Presale (open to everyone).",
      },
      { status: 401 },
    );
  }
  // Cumulative eligibility: Early Believers → tier-1 only; Early Supporters →
  // any member; Public → anyone. (access is guaranteed for tiers 1/2 above.)
  if (!isTierEligible(t.id, access?.tier ?? null)) {
    return NextResponse.json(
      { error: "Early Believers is reserved for D-VIP/D-Pro 3-6 members." },
      { status: 403 },
    );
  }

  try {
    const { amount } = await verifyUsdcContribution(
      txSig,
      PRESALE_WALLET_ADDRESS,
      wallet,
    );

    // Record atomically and let the DB decide the row's status under a
    // per-wallet lock. INVARIANT: a verified on-chain payment is NEVER dropped.
    // Problem payments (below the tier minimum, over the per-wallet cap, or past
    // the tier's token allocation) are stored as 'pending' (excluded from
    // totals/caps) and flagged for manual review instead of being rejected and
    // lost. Idempotent on txSig: a re-submit (even a third-party racing the
    // buyer's own record call with a different tier) is a no-op.
    const result = await recordContributionWithCap({
      wallet,
      tier: tier as TierId,
      amount,
      txSig,
      memberUid: access?.uid ?? null, // audit trail for shared-link abuse
      minBuy: t.minBuy,
      maxBuy: t.maxBuy,
      tierCeiling: tierUsdcCeiling(t),
    });

    // Branch on the row's STATUS, not on whether THIS call did the insert: an
    // idempotent re-submit (result.recorded === false) of a previously-flagged
    // payment must still surface as flagged, or the buyer sees a plain success
    // and never learns it needs manual review. `reason` is only known when this
    // call inserted the row, so fall back to a generic flag message on retries.
    if (result.status === "pending") {
      const warning =
        result.reason === "below_min"
          ? `This ${amount} USDC payment is below the ${t.name} minimum, so it was flagged for manual review. Contact support about transaction ${txSig}.`
          : result.reason === "over_tier"
            ? `${t.name} is fully allocated, so this payment was flagged for manual review. Contact support about transaction ${txSig}.`
            : result.reason === "over_cap"
              ? `This payment put the wallet over the ${t.name} per-wallet cap, so it was flagged for manual review. Contact support about transaction ${txSig}.`
              : `This payment is flagged for manual review. Contact support about transaction ${txSig}.`;
      return NextResponse.json({ ok: true, amount, warning });
    }

    return NextResponse.json({ ok: true, amount });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed." },
      { status: 400 },
    );
  }
}
