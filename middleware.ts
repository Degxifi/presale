import { NextResponse, type NextRequest } from "next/server";

/**
 * Presale-ended gate.
 *
 * The presale is over, so the public site is sealed: every visitor — whatever
 * URL they hit, including /claim — is rewritten to the full-screen
 * `/presale-ended` takeover. The visited URL stays in the bar (rewrite, not
 * redirect), so there's no way to browse the old presale pages.
 *
 * Left reachable on purpose:
 *   • `/admin` + `/api`  — the team dashboard and its endpoints keep working.
 *   • `/presale-ended`   — the takeover page itself (no rewrite loop).
 *   • Next internals + static assets — excluded by the matcher below so the
 *     takeover page can load its CSS/JS/fonts.
 *
 * To bring the site back, delete this file — the original pages are untouched.
 */

const ENDED_PATH = "/presale-ended";

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (
    pathname === ENDED_PATH ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = ENDED_PATH;
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on every route EXCEPT Next internals, the favicon, and any path with a
  // file extension (static assets like /logo.png) so the takeover can render.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
