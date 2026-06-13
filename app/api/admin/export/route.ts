import { getAdminSession } from "@/lib/admin/guard";
import { getAllContributions, getFlaggedContributions } from "@/lib/db/queries";
import { degxForUsdc, getTier } from "@/lib/presale";
import type { TierId } from "@/types/presale";

export const dynamic = "force-dynamic";

/**
 * CSV of contributions for post-graduation distribution (brief §10). Includes a
 * `status` column and the flagged ('pending') rows too, so the verified-on-chain
 * payments that were flagged for manual review are visible/reconcilable here —
 * only `confirmed` rows should be distributed.
 */
export async function GET() {
  if (!(await getAdminSession())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [confirmed, flagged] = await Promise.all([
    getAllContributions(),
    getFlaggedContributions(),
  ]);
  const rows = [...confirmed, ...flagged];
  const header = [
    "wallet",
    "tier",
    "usdc",
    "degx_allocated",
    "tx_signature",
    "status",
    "timestamp",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const usdc = Number(r.amountUsdc);
    // Only confirmed rows are distributable. Emit degx_allocated = 0 for
    // flagged ('pending') rows so a status-unaware distribution script that
    // sums this column can't over-allocate to a flagged wallet; the usdc +
    // status columns still expose them for reconciliation.
    const degx =
      r.status === "confirmed"
        ? Math.round(degxForUsdc(usdc, getTier(r.tier as TierId).price))
        : 0;
    lines.push(
      [r.wallet, r.tier, usdc, degx, r.txSig, r.status, r.createdAt.toISOString()].join(","),
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="degx-contributions.csv"',
    },
  });
}
