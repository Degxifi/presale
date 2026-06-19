import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAdminSession } from "@/lib/admin/guard";
import {
  clearInflight,
  commitConfirmed,
  getConfirmedAllocations,
  getDistributionRows,
  getSettings,
  setInflight,
} from "@/lib/db/queries";
import {
  classifySignatures,
  getMintInfo,
  unlockedTarget,
} from "@/lib/solana/distribute";

export const dynamic = "force-dynamic";

const serverConnection = () =>
  new Connection(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    "confirmed",
  );

type SentItem = { wallet: string; amount: string; sig: string; lvbh: number };

/**
 * Two phases of the distribution write path (admin-gated):
 *  - action "sent": write-ahead log. Re-derives `owed` server-side and REJECTS
 *    any item exceeding it (the ledger can never be tricked into over-crediting)
 *    or any wallet that still has a live in-flight entry (reload to reconcile).
 *  - action "confirmed": re-checks the given signatures ON-CHAIN (never trusts
 *    the client) and commits the confirmed ones / clears the dead ones.
 */
export async function POST(request: Request) {
  if (!(await getAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { degxMint } = await getSettings();
  if (!degxMint)
    return NextResponse.json({ error: "Token mint not set." }, { status: 503 });

  let body: { action?: string; unlock?: number; items?: SentItem[]; sigs?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const c = serverConnection();
  let mint: PublicKey;
  try {
    mint = new PublicKey(degxMint);
  } catch {
    return NextResponse.json({ error: "Invalid token mint." }, { status: 400 });
  }

  if (body.action === "sent") {
    const items = body.items ?? [];
    const pct = Number(body.unlock);
    const unlockBps =
      Number.isFinite(pct) && pct > 0 && pct <= 100 ? Math.round(pct * 100) : 0;
    if (!unlockBps) return NextResponse.json({ error: "Bad unlock %." }, { status: 400 });
    if (items.length === 0) return NextResponse.json({ ok: true });

    const { decimals } = await getMintInfo(c, mint);
    const scale = 10n ** BigInt(decimals);
    const alloc = await getConfirmedAllocations();
    const state = new Map((await getDistributionRows()).map((r) => [r.wallet, r]));

    for (const it of items) {
      const st = state.get(it.wallet);
      if (st?.inflightSig)
        return NextResponse.json(
          { error: `${it.wallet} already has an in-flight transfer — reload the plan to reconcile.` },
          { status: 409 },
        );
      const totalBase = (alloc.get(it.wallet) ?? 0n) * scale;
      const distributed = st ? BigInt(st.distributed) : 0n;
      const owed = unlockedTarget(totalBase, unlockBps) - distributed;
      let amount: bigint;
      try {
        amount = BigInt(it.amount);
      } catch {
        return NextResponse.json({ error: `Bad amount for ${it.wallet}.` }, { status: 400 });
      }
      if (amount <= 0n || amount > owed)
        return NextResponse.json(
          { error: `Amount ${it.amount} for ${it.wallet} exceeds owed ${owed}.` },
          { status: 400 },
        );
    }

    await setInflight(
      items.map((it) => ({ wallet: it.wallet, amount: it.amount, sig: it.sig, lvbh: it.lvbh })),
    );
    return NextResponse.json({ ok: true, recorded: items.length });
  }

  if (body.action === "confirmed") {
    const sigs = body.sigs ?? [];
    if (sigs.length === 0) return NextResponse.json({ ok: true });
    const rows = await getDistributionRows();
    const inflight = rows
      .filter((r) => r.inflightSig && sigs.includes(r.inflightSig))
      .map((r) => ({ sig: r.inflightSig!, lvbh: r.inflightLvbh ?? 0 }));
    if (inflight.length === 0) return NextResponse.json({ ok: true });

    const cls = await classifySignatures(c, inflight);
    const confirmed = [...cls].filter(([, s]) => s === "confirmed").map(([s]) => s);
    const dead = [...cls].filter(([, s]) => s === "failed" || s === "expired").map(([s]) => s);
    if (confirmed.length) await commitConfirmed(confirmed);
    if (dead.length) await clearInflight(dead);
    return NextResponse.json({
      ok: true,
      confirmed: confirmed.length,
      cleared: dead.length,
      pending: inflight.length - confirmed.length - dead.length,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
