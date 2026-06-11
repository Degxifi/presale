import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ipAddress } from "@vercel/functions";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import { PRESALE_WALLET_ADDRESS, isPresaleConfigured } from "@/lib/solana/config";
import { verifyUsdcContribution } from "@/lib/solana/verify";
import { getTier } from "@/lib/presale";
import { recordContribution } from "@/lib/db/queries";
import { checkRateLimit } from "@/lib/rate-limit";
import type { TierId } from "@/types/presale";

/**
 * Record a confirmed contribution. The amount is taken from the ON-CHAIN
 * transaction (verified here), never trusted from the client.
 */
export async function POST(request: Request) {
  const ip = ipAddress(request) ?? "anonymous";
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

  // Members-only: the signed access cookie is required to record a buy
  // (defense in depth — middleware already blocks /api without it).
  const cookieStore = await cookies();
  const access = await verifyAccessToken(cookieStore.get(ACCESS_COOKIE)?.value);
  if (!access) {
    return NextResponse.json(
      { error: "Presale access required. Open the presale from your Degxifi dashboard." },
      { status: 401 },
    );
  }

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

  try {
    const { amount } = await verifyUsdcContribution(
      txSig,
      PRESALE_WALLET_ADDRESS,
      wallet,
    );
    const t = getTier(tier as TierId);
    if (amount < t.minBuy - 0.01) {
      return NextResponse.json(
        { error: "Amount is below the tier minimum." },
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
