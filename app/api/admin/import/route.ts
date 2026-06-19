import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/guard";
import { parseContributions } from "@/lib/admin/import";
import { importContributions } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * Import the master contributor list (CSV or JSON, same shape as the export)
 * into `contributions` — the table the distribution reads. Admin-gated.
 *
 * Safe by construction:
 *  - validates every row; a file with ANY bad row is rejected whole (422), so a
 *    malformed master list can never partially land.
 *  - defaults to dryRun: returns the exact diff (insert/update/orphan counts +
 *    totals) so the admin previews before committing.
 *  - replace=true makes `contributions` EXACTLY the file (deletes rows whose
 *    tx_sig isn't present) — that's "use only the csv".
 */
export async function POST(request: Request) {
  if (!(await getAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { content?: string; dryRun?: boolean; replace?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) return NextResponse.json({ error: "Empty file." }, { status: 400 });

  const parsed = parseContributions(content);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        ok: false,
        stage: "validate",
        summary: parsed.summary,
        issueCount: parsed.issues.length,
        issues: parsed.issues.slice(0, 50),
      },
      { status: 422 },
    );
  }

  const dryRun = body.dryRun !== false; // default: preview, don't write
  const replace = body.replace === true;
  const apply = await importContributions(parsed.rows, { dryRun, replace });

  return NextResponse.json({ ok: true, dryRun, replace, summary: parsed.summary, apply });
}
