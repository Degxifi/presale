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

  // Redirect with a RELATIVE Location so the browser resolves it against the
  // public URL it actually requested (e.g. https://presale.degxifi.com). An
  // absolute URL built from request.nextUrl would use the standalone server's
  // internal bind host (HOSTNAME=0.0.0.0:3000, set in the Dockerfile) behind
  // Traefik and send members to https://0.0.0.0:3000/ (ERR_ADDRESS_INVALID).
  // "/" also drops the token from the address bar.
  const home = () =>
    new NextResponse(null, { status: 307, headers: { Location: "/" } });

  // Only backend-minted ENTRY tokens may be exchanged here — a cookie value
  // (typ: "cookie") pasted back into /access must not re-mint a fresh cookie,
  // or access would be infinitely renewable/transferable.
  if (!payload || payload.typ === "cookie") {
    return home();
  }

  const response = home();
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
