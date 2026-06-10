import { getAdminSession } from "@/lib/admin/guard";
import { getAllContributions } from "@/lib/db/queries";
import { degxForUsdc, getTier } from "@/lib/presale";
import type { TierId } from "@/types/presale";

export const dynamic = "force-dynamic";

/** CSV of all confirmed contributions for post-graduation distribution (brief §10). */
export async function GET() {
  if (!(await getAdminSession())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rows = await getAllContributions();
  const header = [
    "wallet",
    "tier",
    "usdc",
    "degx_allocated",
    "tx_signature",
    "timestamp",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const usdc = Number(r.amountUsdc);
    const degx = Math.round(degxForUsdc(usdc, getTier(r.tier as TierId).price));
    lines.push(
      [r.wallet, r.tier, usdc, degx, r.txSig, r.createdAt.toISOString()].join(","),
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="degx-contributions.csv"',
    },
  });
}
