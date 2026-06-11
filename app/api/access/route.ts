import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";

/**
 * The visitor's verified membership tier from the access cookie.
 * Tier 1 = D-VIP/D-Pro 3-6 (may buy Early Believers); tier 2 = levels 1-2.
 */
export async function GET() {
  const cookieStore = await cookies();
  const access = await verifyAccessToken(cookieStore.get(ACCESS_COOKIE)?.value);
  if (!access) {
    return NextResponse.json({ error: "No presale access." }, { status: 401 });
  }
  return NextResponse.json(
    { tier: access.tier },
    { headers: { "cache-control": "no-store" } },
  );
}
