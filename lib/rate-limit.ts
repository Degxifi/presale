import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Distributed rate limiter (Upstash Redis, REST — serverless-safe). Configured
 * via UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. When unset (e.g. local
 * dev) it's a no-op so the app still runs; set the creds in production.
 *
 * Get the client IP with `ipAddress(request)` from `@vercel/functions` at the
 * call site (the standard Next.js/Vercel way).
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const limiter =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(10, "60 s"),
        prefix: "degx:rl",
        analytics: false,
      })
    : null;

export const isRateLimitConfigured = () => Boolean(limiter);

/** True if allowed; false if the key exceeded the window. Fails open on errors. */
export async function checkRateLimit(key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(key);
    return success;
  } catch {
    return true; // don't block real users on a limiter outage
  }
}
