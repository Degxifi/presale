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
  if ("presaleStart" in b) patch.presaleStart = b.presaleStart ? String(b.presaleStart) : null;
  if ("tierOverrides" in b && b.tierOverrides && typeof b.tierOverrides === "object") {
    patch.tierOverrides = b.tierOverrides as AppSettings["tierOverrides"];
  }

  await updateSettings(patch);
  return NextResponse.json({ ok: true });
}
