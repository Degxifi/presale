import { NextResponse } from "next/server";
import { getWalletRaisedByTier } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const raisedByTier = await getWalletRaisedByTier(address);
  return NextResponse.json(
    { raisedByTier },
    { headers: { "cache-control": "no-store" } },
  );
}
