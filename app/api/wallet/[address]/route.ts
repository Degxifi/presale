import { NextResponse } from "next/server";
import { getWalletRaisedByTier } from "@/lib/db/queries";
import { isLikelyWalletAddress } from "@/lib/solana/config";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  // Unauthenticated + uncached DB read, so throttle it like the RPC proxy to
  // stop unbounded per-wallet enumeration / DB-load amplification.
  if (!(await checkRateLimit(`wallet:${clientIp(request)}`, "rpc"))) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 },
    );
  }

  const { address } = await params;
  // Reject malformed input before touching the DB (no arbitrary-string queries).
  if (!isLikelyWalletAddress(address)) {
    return NextResponse.json(
      { error: "Invalid wallet address." },
      { status: 400 },
    );
  }

  const raisedByTier = await getWalletRaisedByTier(address);
  return NextResponse.json(
    { raisedByTier },
    { headers: { "cache-control": "no-store" } },
  );
}
