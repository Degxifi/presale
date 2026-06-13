import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Server-side Solana RPC proxy. The browser's wallet/connection calls hit this
 * same-origin route, which forwards JSON-RPC to the real provider using the
 * SERVER-ONLY `SOLANA_RPC_URL` (with the provider key). The key is never sent
 * to the client.
 *
 * Hardened: per-IP rate limit + a strict method allowlist, so the proxy can't
 * be farmed as a free RPC endpoint on our provider key (which would also
 * starve contribution verification, which shares the same provider quota).
 */

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/**
 * Only the JSON-RPC methods the wallet/buy flow actually uses (see
 * lib/solana/usdc.ts + the wallet adapter's sendTransaction). Everything else
 * — getProgramAccounts scans, history crawls, arbitrary relay use — is denied.
 */
const ALLOWED_METHODS = new Set([
  "getLatestBlockhash",
  "getBalance",
  "getTokenAccountBalance",
  "getSignatureStatuses",
  "sendTransaction",
  "simulateTransaction",
  "getAccountInfo",
  "getFeeForMessage",
]);

export async function POST(request: Request) {
  // Deter cross-site browser abuse of our RPC quota (server callers can spoof,
  // so this is a deterrent — the rate limit below is the real backstop). Match
  // the Origin's HOST exactly, not by suffix: `endsWith(host)` would accept any
  // sibling like evilpresale.degxifi.com (it ends with presale.degxifi.com).
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost !== host) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (!(await checkRateLimit(`rpc:${clientIp(request)}`, "rpc"))) {
    return Response.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 },
    );
  }

  const body = await request.text();

  // Method allowlist — checked for single requests and EVERY element of a
  // JSON-RPC batch (a batch with any disallowed call is rejected whole).
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON-RPC body." }, { status: 400 });
  }
  const calls = Array.isArray(parsed) ? parsed : [parsed];
  // Cap batch size: the buy flow never batches more than a handful, but an
  // unbounded batch costs ONE rate-limit token while multiplying provider-quota
  // consumption by its length — it could starve contribution verification.
  if (calls.length > 8) {
    return Response.json(
      { error: "RPC batch too large." },
      { status: 400 },
    );
  }
  const allowed =
    calls.length > 0 &&
    calls.every(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as { method?: unknown }).method === "string" &&
        ALLOWED_METHODS.has((c as { method: string }).method),
    );
  if (!allowed) {
    return Response.json({ error: "RPC method not allowed." }, { status: 403 });
  }

  const upstream = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
