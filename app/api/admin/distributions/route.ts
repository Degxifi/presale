import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAdminSession } from "@/lib/admin/guard";
import { getDistributions, getSettings } from "@/lib/db/queries";
import { getMintInfo } from "@/lib/solana/distribute";

export const dynamic = "force-dynamic";

const rpcUrl = () => process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const clusterOf = (url: string) =>
  url.includes("devnet") ? "devnet" : url.includes("testnet") ? "testnet" : "";

/**
 * Read model for the dashboard's Distributions view: every paid (or in-flight)
 * wallet with the on-chain signatures that delivered its tokens, plus totals.
 * Admin-gated. `cluster` lets the UI build correct Solscan links (devnet now).
 */
export async function GET() {
  if (!(await getAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getDistributions();
  const { degxMint } = await getSettings();

  // Resolve decimals for display only — stored amounts are exact base units.
  let decimals = 6;
  if (degxMint) {
    try {
      decimals = (await getMintInfo(new Connection(rpcUrl(), "confirmed"), new PublicKey(degxMint)))
        .decimals;
    } catch {
      /* fall back to 6 */
    }
  }

  let distributedTotal = 0n;
  let txCount = 0;
  for (const r of rows) {
    distributedTotal += BigInt(r.distributed);
    txCount += r.sigs.length;
  }

  return NextResponse.json(
    {
      mint: degxMint ?? "",
      decimals,
      cluster: clusterOf(rpcUrl()),
      totals: {
        walletsPaid: rows.filter((r) => BigInt(r.distributed) > 0n).length,
        distributedTotal: distributedTotal.toString(),
        txCount,
      },
      rows,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
