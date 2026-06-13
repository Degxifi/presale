/**
 * Presale access gate — token + cookie verification.
 *
 * Entry tokens are minted by the Degxifi backend with the shared
 * PRESALE_ACCESS_SECRET in the format
 * `base64url(JSON{uid,tier,iat,exp}) + "." + base64url(HMAC-SHA256(payload))`.
 * `/access` exchanges a valid entry token for a longer-lived cookie in the
 * exact same format, signed here with the same secret.
 *
 * Web Crypto only (no node:crypto) so the same helpers run in Edge
 * middleware and Node route handlers. When the secret is unset the gate
 * fails CLOSED — every verification returns null — because an open gate
 * would silently make the presale public again.
 */

export const ACCESS_COOKIE = "presale_access";

/** Cookie lifetime: one week, then the member just clicks through again. */
export const ACCESS_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

/**
 * Unix seconds for 2026-06-13T00:00:00Z — the cutover after which every minted
 * cookie carries typ:"cookie". Cookies with iat before this may legitimately be
 * typ-less (minted before the typ field shipped) and are still honored on the
 * read paths; a typ-less token with a later iat is a raw entry token and is
 * rejected as a cookie. Safe to delete once pre-cutover cookies have expired
 * (~2026-06-20), reverting to a strict typ==="cookie" check.
 */
const TYP_CUTOVER = 1781308800;

export type AccessPayload = {
  uid: string;
  tier: 1 | 2;
  iat: number;
  exp: number;
  /** Set on cookie values only. Entry tokens (backend-minted) never carry it,
   * so /access can refuse to re-mint a cookie from another cookie. */
  typ?: "cookie";
};

const getSecret = () => process.env.PRESALE_ACCESS_SECRET;

export const isAccessConfigured = () => Boolean(getSecret());

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): Uint8Array | null {
  try {
    const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function signSegment(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  return b64urlEncode(new Uint8Array(sig));
}

/** Compare signatures without revealing where they diverge. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify an entry token or cookie value. Null if invalid, expired, or
 * unconfigured.
 *
 * `expectCookie` is for the cookie-READ paths (the access cookie, the
 * contribution gate, the landing page): they must only accept a value WE minted
 * (typ:"cookie"), not a raw backend entry token pasted in as a cookie. Only
 * `/access` (the exchange endpoint) verifies raw entry tokens, and it has its
 * own typ guard. NOTE: this does not stop replay of a still-valid /access link
 * before its exp — single-use enforcement needs a backend-minted jti.
 */
export async function verifyAccessToken(
  token: string | undefined | null,
  opts: { expectCookie?: boolean } = {},
): Promise<AccessPayload | null> {
  const secret = getSecret();
  if (!secret || !token) return null;

  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expected = await signSegment(payloadB64, secret);
  if (!timingSafeEqual(sig, expected)) return null;

  const bytes = b64urlDecode(payloadB64);
  if (!bytes) return null;

  let payload: AccessPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }

  if (typeof payload.uid !== "string" || (payload.tier !== 1 && payload.tier !== 2)) {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
    return null;
  }
  // expectCookie: read paths accept only a value WE minted (typ:"cookie").
  // Exception: cookies minted BEFORE typ existed (iat before the cutover) are
  // still honored so early members aren't locked out — but ONLY those. Gating on
  // iat (not just "typ missing") means a raw backend entry token, which is also
  // typ-less but minted after the cutover, is still rejected as a cookie — so the
  // entry-token-as-cookie bypass stays closed, and this legacy allowance can't
  // silently persist past the pre-typ cookies' 7-day expiry (~2026-06-19), after
  // which this exception is dead and can be removed for strict `!== "cookie"`.
  if (opts.expectCookie && payload.typ !== "cookie") {
    const legacyCookie = payload.typ === undefined && payload.iat < TYP_CUTOVER;
    if (!legacyCookie) return null;
  }
  return payload;
}

/** Re-mint a verified entry payload as the longer-lived access cookie value. */
export async function mintCookieToken(payload: AccessPayload): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("PRESALE_ACCESS_SECRET is not configured");

  const now = Math.floor(Date.now() / 1000);
  const cookiePayload: AccessPayload = {
    uid: payload.uid,
    tier: payload.tier,
    iat: now,
    exp: now + ACCESS_COOKIE_MAX_AGE,
    typ: "cookie",
  };
  const payloadB64 = b64urlEncode(enc.encode(JSON.stringify(cookiePayload)));
  return `${payloadB64}.${await signSegment(payloadB64, secret)}`;
}
