import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";

/**
 * Members-only gate: every page and API requires the signed `presale_access`
 * cookie, which `/access` sets from a valid Degxifi-app entry link. Without
 * it, pages land on /restricted and APIs get a 401. The admin area keeps its
 * own Better Auth login and stays reachable without a member cookie.
 */

const PUBLIC_PATHS = ["/restricted", "/access"];
const PUBLIC_PREFIXES = ["/admin", "/api/admin", "/api/auth"];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  const payload = await verifyAccessToken(request.cookies.get(ACCESS_COOKIE)?.value);
  if (payload) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Presale access required. Open the presale from your Degxifi dashboard." },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/restricted";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except Next internals, metadata images, and static assets.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|twitter-image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?)$).*)",
  ],
};
