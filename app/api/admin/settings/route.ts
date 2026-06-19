import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/guard";
import { type AppSettings, getSettings, updateSettings } from "@/lib/db/queries";
import { isLikelyWalletAddress } from "@/lib/solana/config";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getSettings());
}

export async function POST(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = (body ?? {}) as Partial<AppSettings>;
  const patch: Partial<AppSettings> = {};
  if ("announcement" in b) patch.announcement = b.announcement ? String(b.announcement) : null;
  if ("degxMint" in b) {
    const v = b.degxMint ? String(b.degxMint).trim() : null;
    if (v !== null && !isLikelyWalletAddress(v)) {
      return NextResponse.json(
        { error: "Invalid mint address (expected a base58 Solana address)." },
        { status: 400 },
      );
    }
    patch.degxMint = v;
  }
  if ("presaleStart" in b) {
    const v = b.presaleStart ? String(b.presaleStart) : null;
    // Require a STRICT ISO-8601 date(-time), not just `new Date()`-parseable:
    // `new Date("1")` etc. parse to a real (wrong) date, which would silently
    // shift the launch time. The admin UI sends `new Date(...).toISOString()`,
    // which matches. Reject anything else with a 400.
    const ISO_RE =
      /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
    if (v !== null && (!ISO_RE.test(v) || Number.isNaN(new Date(v).getTime()))) {
      return NextResponse.json(
        { error: "Invalid presaleStart — use an ISO date/time." },
        { status: 400 },
      );
    }
    patch.presaleStart = v;
  }
  if (
    "tierOverrides" in b &&
    b.tierOverrides &&
    typeof b.tierOverrides === "object" &&
    !Array.isArray(b.tierOverrides) // arrays are objects; reject [..] payloads
  ) {
    // Whitelist: only tiers 1-3 with the two real override values survive, so
    // junk can't be persisted into the jsonb column.
    const raw = b.tierOverrides as Record<string, unknown>;
    const clean: AppSettings["tierOverrides"] = {};
    for (const id of [1, 2, 3] as const) {
      const val = raw[id];
      if (val === "paused" || val === "closed") clean[id] = val;
    }
    patch.tierOverrides = clean;
  }

  await updateSettings(patch);
  return NextResponse.json({ ok: true });
}
