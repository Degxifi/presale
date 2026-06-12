import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  mintCookieToken,
  verifyAccessToken,
} from "@/lib/access";

/**
 * Entry point for signed links from the Degxifi app:
 * `/access?token=…` → verify → set the access cookie → home. The cookie only
 * UNLOCKS the early rounds; the site itself is public, so invalid or expired
 * tokens just land on home (no longer gated to /restricted).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const payload = await verifyAccessToken(token);

  const dest = request.nextUrl.clone();
  dest.search = "";

  // Only backend-minted ENTRY tokens may be exchanged here — a cookie value
  // (typ: "cookie") pasted back into /access must not re-mint a fresh cookie,
  // or access would be infinitely renewable/transferable.
  if (!payload || payload.typ === "cookie") {
    dest.pathname = "/";
    return NextResponse.redirect(dest);
  }

  dest.pathname = "/";
  const response = NextResponse.redirect(dest);
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: await mintCookieToken(payload),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  return response;
}
