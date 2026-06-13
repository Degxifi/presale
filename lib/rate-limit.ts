import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Distributed rate limiter (Upstash Redis, REST — serverless-safe). Configured
 * via UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. When unset (e.g. local
 * dev) it's a no-op so the app still runs; set the creds in production.
 *
 * Get the client IP for the limit key with `clientIp(request)` (below), which
 * reads the standard forwarded headers so it works behind Traefik or on Vercel.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

// A missing env var in production must be visible, not a silent no-op — this
// shows up once in the deploy logs.
if (!redis && process.env.NODE_ENV === "production") {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN are not set — rate limiting is DISABLED.",
  );
}

const makeLimiter = (requestsPerMinute: number) =>
  redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requestsPerMinute, "60 s"),
        prefix: "degx:rl",
        analytics: false,
      })
    : null;

const LIMITERS = {
  /** Write/verify endpoints (contributions): 10 req/min per IP. */
  strict: makeLimiter(10),
  /** The RPC proxy: a single buy flow makes a dozen calls (blockhash, send,
   * status polls), so this is looser — 60 req/min per IP. */
  rpc: makeLimiter(60),
};

export const isRateLimitConfigured = () => Boolean(redis);

/** True if allowed; false if the key exceeded the window. Fails open on errors. */
export async function checkRateLimit(
  key: string,
  kind: keyof typeof LIMITERS = "strict",
): Promise<boolean> {
  const limiter = LIMITERS[kind];
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch {
    return true; // don't block real users on a limiter outage
  }
}

/**
 * Best-effort client IP for rate-limit keys.
 *
 * Order matters because the topology decides which header holds the REAL
 * client IP:
 *  - Behind Cloudflare (CF → Traefik), Traefik appends Cloudflare's edge IP as
 *    the rightmost X-Forwarded-For entry, so the rightmost is NOT the visitor —
 *    it's a CF PoP shared by thousands of users, which would collapse every
 *    visitor into one rate-limit bucket (mass false 429s at launch). Cloudflare
 *    puts the true client IP in `cf-connecting-ip`, so trust that FIRST.
 *  - With only our own proxy (Traefik on Dokploy / Vercel, no CDN), there is no
 *    cf-connecting-ip, and the RIGHTMOST X-Forwarded-For entry is the one our
 *    proxy appended (the real client) — a client-supplied left entry can't spoof
 *    it. Use that next.
 * Falls back to "anonymous" when unknown; the limiter fails open anyway.
 */
export function clientIp(request: Request): string {
  const h = request.headers;
  const cf = h.get("cf-connecting-ip")?.trim() || h.get("true-client-ip")?.trim();
  if (cf) return cf;
  const last = h
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .at(-1);
  return last || h.get("x-real-ip")?.trim() || "anonymous";
}
