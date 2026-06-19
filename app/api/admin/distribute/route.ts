import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAdminSession } from "@/lib/admin/guard";
import {
  clearInflight,
  commitConfirmed,
  getConfirmedAllocations,
  getDistributionRows,
  getSettings,
} from "@/lib/db/queries";
import {
  classifySignatures,
  getDegxDecimals,
  unlockedTarget,
} from "@/lib/solana/distribute";

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
 * Distribution plan for a given unlock %. The $DEGX mint is read from admin
 * settings (DB) — not env. Reconciles in-flight transfers against the chain
 * FIRST (so a crashed run heals), then returns per-wallet
 * `owed = floor(allocation × unlock%) − distributed − in-flight`. Admin-gated.
 */
export async function GET(request: Request) {
  if (!(await getAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pct = Number(new URL(request.url).searchParams.get("unlock") ?? "");
  const unlockBps =
    Number.isFinite(pct) && pct > 0 && pct <= 100 ? Math.round(pct * 100) : 0;

  const { degxMint } = await getSettings();
  const base = {
    mint: degxMint ?? "",
    decimals: 0,
    unlockBps,
    recipients: [] as { wallet: string; owed: string }[],
    totals: ZERO_TOTALS,
  };
  if (!degxMint) return NextResponse.json({ configured: false, ...base });

  const c = serverConnection();
  let mint: PublicKey;
  let decimals: number;
  try {
    mint = new PublicKey(degxMint);
    decimals = await getDegxDecimals(c, mint);
  } catch {
    return NextResponse.json({
      configured: false,
      ...base,
      error: "Couldn't load this mint — check the address.",
    });
  }

  // 1) reconcile in-flight against the chain
  const rows = await getDistributionRows();
  const inflight = rows
    .filter((r) => r.inflightSig)
    .map((r) => ({ sig: r.inflightSig!, lvbh: r.inflightLvbh ?? 0 }));
  if (inflight.length) {
    const cls = await classifySignatures(c, inflight);
    const confirmed = [...cls].filter(([, s]) => s === "confirmed").map(([s]) => s);
    const dead = [...cls].filter(([, s]) => s === "failed" || s === "expired").map(([s]) => s);
    if (confirmed.length) await commitConfirmed(confirmed);
    if (dead.length) await clearInflight(dead);
  }

  // 2) recompute owed from the healed ledger
  const fresh = await getDistributionRows();
  const state = new Map(fresh.map((r) => [r.wallet, r]));
  const alloc = await getConfirmedAllocations();
  const scale = 10n ** BigInt(decimals);

  let allocatedTotal = 0n;
  let distributedTotal = 0n;
  let owedTotal = 0n;
  const recipients: { wallet: string; owed: string }[] = [];
  for (const [wallet, tokens] of alloc) {
    const totalBase = tokens * scale;
    allocatedTotal += totalBase;
    const st = state.get(wallet);
    const distributed = st ? BigInt(st.distributed) : 0n;
    const inflightAmt = st?.inflightAmount ? BigInt(st.inflightAmount) : 0n;
    distributedTotal += distributed;
    const owed = unlockedTarget(totalBase, unlockBps) - distributed - inflightAmt;
    if (owed > 0n) {
      recipients.push({ wallet, owed: owed.toString() });
      owedTotal += owed;
    }
  }
  recipients.sort((a, b) => (BigInt(b.owed) > BigInt(a.owed) ? 1 : -1));

  return NextResponse.json(
    {
      configured: true,
      mint: degxMint,
      decimals,
      unlockBps,
      recipients,
      totals: {
        recipientCount: recipients.length,
        allocatedTotal: allocatedTotal.toString(),
        distributedTotal: distributedTotal.toString(),
        owedTotal: owedTotal.toString(),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
