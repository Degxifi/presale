import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import { PRESALE_WALLET_ADDRESS, isPresaleConfigured } from "@/lib/solana/config";
import { verifyUsdcContribution } from "@/lib/solana/verify";
import {
  computeTierProgress,
  getPresalePhase,
  getTier,
  isTierEligible,
  resolvePresaleStart,
} from "@/lib/presale";
import {
  getRawStats,
  getSettings,
  getWalletRaisedByTier,
  recordContribution,
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
  // read it here and enforce per-tier below.
  const cookieStore = await cookies();
  const access = await verifyAccessToken(cookieStore.get(ACCESS_COOKIE)?.value);

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

  const t = getTier(tier as TierId);

  // Enforce what the tier cards promise, server-side — checked BEFORE the
  // on-chain lookup so out-of-band submissions fail fast: the tier must be
  // OPEN (launch time + sequential fill + admin overrides), and round 1
  // (Early Believers) is reserved for tier-1 members (D-VIP/D-Pro 3-6).
  const [{ raisedByTier }, settings] = await Promise.all([
    getRawStats(),
    getSettings(),
  ]);
  const phase = getPresalePhase(resolvePresaleStart(settings.presaleStart));
  const progress = computeTierProgress(raisedByTier, phase, settings.tierOverrides);
  const tierStatus = progress.find((p) => p.tierId === t.id)?.status;
  if (tierStatus !== "active") {
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
          "This round is for Degxifi members — open the presale from your dashboard, or wait for the Public Presale.",
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
    if (amount < t.minBuy - 0.01) {
      return NextResponse.json(
        { error: "Amount is below the tier minimum." },
        { status: 400 },
      );
    }

    const walletRaised = await getWalletRaisedByTier(wallet);
    if (walletRaised[t.id] + amount > t.maxBuy + 0.01) {
      return NextResponse.json(
        {
          error: `This wallet is over the ${t.name} per-wallet cap. Contact support about transaction ${txSig}.`,
        },
        { status: 400 },
      );
    }

    await recordContribution({ wallet, tier: tier as TierId, amount, txSig });
    return NextResponse.json({ ok: true, amount });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed." },
      { status: 400 },
    );
  }
}
