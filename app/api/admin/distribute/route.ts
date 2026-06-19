import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAdminSession } from "@/lib/admin/guard";
import { buildPlan } from "@/lib/distribution";

export const dynamic = "force-dynamic";

const serverConnection = () =>
  new Connection(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    "confirmed",
  );

const ZERO_TOTALS = {
  recipientCount: 0,
  allocatedTotal: "0",
  distributedTotal: "0",
  owedTotal: "0",
};

/**
 * Distribution plan for a given unlock %. The $DEGX mint is owned by the script
 * and read from env (DEGX_MINT), so this view uses the same value the CLI pays
 * with. Allocations come from the uploaded `contributions`; both share the same
 * ledger. Admin-gated.
 */
export async function GET(request: Request) {
  if (!(await getAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pct = Number(new URL(request.url).searchParams.get("unlock") ?? "");
  const unlockBps =
    Number.isFinite(pct) && pct > 0 && pct <= 100 ? Math.round(pct * 100) : 0;

  const degxMint = process.env.DEGX_MINT ?? "";
  const base = {
    mint: degxMint,
    tokenProgram: "",
    decimals: 0,
    transferFeeBps: 0,
    unlockBps,
    recipients: [] as { wallet: string; owed: string }[],
    totals: ZERO_TOTALS,
  };
  if (!degxMint)
    return NextResponse.json({ configured: false, ...base, error: "Set DEGX_MINT in the environment." });

  try {
    const mint = new PublicKey(degxMint);
    const plan = await buildPlan(serverConnection(), mint, unlockBps);
    return NextResponse.json(
      {
        configured: true,
        mint: degxMint,
        tokenProgram: plan.programId.toBase58(),
        decimals: plan.decimals,
        transferFeeBps: plan.transferFeeBps,
        unlockBps,
        recipients: plan.recipients.map((r) => ({ wallet: r.wallet, owed: r.owed.toString() })),
        totals: {
          recipientCount: plan.recipients.length,
          allocatedTotal: plan.allocatedTotal.toString(),
          distributedTotal: plan.distributedTotal.toString(),
          owedTotal: plan.owedTotal.toString(),
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({
      configured: false,
      ...base,
      error: "Couldn't load this mint — check the address.",
    });
  }
}
