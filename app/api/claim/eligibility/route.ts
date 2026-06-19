import { NextResponse } from "next/server";
import { isLikelyWalletAddress } from "@/lib/solana/config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getWalletConfirmedRows, getDistribution } from "@/lib/db/queries";
import { computeOwedWholeDegx, claimableForTranche, activeTranche, type Eligibility } from "@/lib/claim";

export const dynamic = "force-dynamic";

/**
 * Read-only $DEGX eligibility for a wallet: how much it's owed and whether it's
 * already claimed/in-flight. Display only — no signing, no token movement (the
 * backend claim endpoint is authoritative and re-checks everything).
 */
export async function GET(request: Request) {
  const ip = clientIp(request);
  if (!(await checkRateLimit(`claim-elig:${ip}`))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const wallet = new URL(request.url).searchParams.get("wallet")?.trim();
  if (!isLikelyWalletAddress(wallet)) {
    return NextResponse.json({ error: "Invalid wallet." }, { status: 400 });
  }

  const tranche = activeTranche();
  const [rows, dist] = await Promise.all([
    getWalletConfirmedRows(wallet),
    getDistribution(wallet, tranche),
  ]);
  // Claimable now = the currently-open tranche's share (40% now / 60% later).
  const owed = claimableForTranche(computeOwedWholeDegx(rows), tranche);

  let result: Eligibility;
  if (owed <= 0) {
    result = { owed: 0, status: "not_eligible" };
  } else if (dist?.status === "confirmed") {
    result = { owed, status: "claimed", txSig: dist.txSig };
  } else if (dist?.status === "pending" || dist?.status === "submitted") {
    result = { owed, status: "in_flight", txSig: dist.txSig };
  } else {
    result = { owed, status: "claimable" };
  }

  return NextResponse.json(result, {
    headers: { "cache-control": "no-store" },
  });
}
