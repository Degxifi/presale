import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/guard";
import { type AppSettings, getSettings, updateSettings } from "@/lib/db/queries";

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
  if ("presaleStart" in b) {
    const v = b.presaleStart ? String(b.presaleStart) : null;
    // Reject an unparseable date here (returns 400) instead of letting an
    // Invalid Date reach the driver and throw an opaque 500 on write.
    if (v !== null && Number.isNaN(new Date(v).getTime())) {
      return NextResponse.json(
        { error: "Invalid presaleStart — use an ISO date/time." },
        { status: 400 },
      );
    }
    patch.presaleStart = v;
  }
  if ("tierOverrides" in b && b.tierOverrides && typeof b.tierOverrides === "object") {
    // Whitelist: only tiers 1-3 with the two real override values survive, so
    // junk/arrays can't be persisted into the jsonb column.
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
