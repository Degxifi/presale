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
 *
 * Observability: every rejection (cross-site origin, rate limit, disallowed
 * method) and every upstream failure is logged to stdout (captured by the
 * container logs) so a buy-flow break — e.g. a suspended/errored RPC provider
 * returning 401/403, or a missing SOLANA_RPC_URL — is visible, not silent. The
 * provider URL (which carries the API key) is NEVER logged; only its host.
 */

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/** Provider host only (no API key) — safe to log. */
const RPC_HOST = (() => {
  try {
    return new URL(RPC_URL).host;
  } catch {
    return "invalid-SOLANA_RPC_URL";
  }
})();

if (!process.env.SOLANA_RPC_URL) {
  // Surfaces once per server start in the container logs.
  console.warn(
    "[rpc] SOLANA_RPC_URL is not set — falling back to the public mainnet RPC, which rate-limits heavily and will break the buy flow under load.",
  );
}

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
  // Admin token-distribution: the panel checks which recipient ATAs already
  // exist (fetchMissingAtas) from the browser, which batches address lookups
  // into getMultipleAccountsInfo. Without this the distribution 403s before it
  // can send anything.
  "getMultipleAccountsInfo",
  "getFeeForMessage",
]);

export async function POST(request: Request) {
  const ip = clientIp(request);

  // Deter cross-site browser abuse of our RPC quota (server callers can spoof,
  // so this is only a deterrent — the per-IP rate limit below is the real
  // backstop). Match the Origin's HOST exactly, not by suffix: an `endsWith`
  // check would accept any sibling like evilpresale.degxifi.com.
  //
  // CRUCIAL: fail OPEN on anything ambiguous. A mobile wallet in-app browser
  // commonly sends `Origin: null` (an opaque origin), and behind the reverse
  // proxy the raw `Host` header can be an internal name. Treating those as a
  // mismatch (the old behavior) returned 403 on EVERY RPC call — blockhash,
  // balance, send — locking real buyers out of the presale. So we only reject a
  // CLEARLY cross-site origin: one that parses to a host different from the
  // public host the browser actually used.
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      originHost = null; // unparseable → treat as opaque, fail open
    }
    // Prefer the forwarded host (the domain the browser used) over the raw Host
    // header, which behind Traefik/Dokploy can be an internal hostname.
    const fwd = request.headers.get("x-forwarded-host");
    const host = (fwd ? fwd.split(",")[0] : request.headers.get("host"))
      ?.trim()
      .toLowerCase();
    if (originHost && host && originHost !== host) {
      console.warn(
        `[rpc] blocked cross-site origin=${originHost} reqHost=${host} ip=${ip}`,
      );
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (!(await checkRateLimit(`rpc:${ip}`, "rpc"))) {
    console.warn(`[rpc] rate-limited ip=${ip}`);
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
    return Response.json({ error: "RPC batch too large." }, { status: 400 });
  }
  const methods = calls.map((c) =>
    typeof c === "object" && c !== null && typeof (c as { method?: unknown }).method === "string"
      ? (c as { method: string }).method
      : "<invalid>",
  );
  const allowed =
    calls.length > 0 && methods.every((m) => ALLOWED_METHODS.has(m));
  if (!allowed) {
    console.warn(`[rpc] method not allowed methods=[${methods.join(",")}] ip=${ip}`);
    return Response.json({ error: "RPC method not allowed." }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch (e) {
    // Network/DNS failure reaching the provider — log and return a clear 502 so
    // the client doesn't see an opaque 500.
    console.error(
      `[rpc] upstream fetch failed host=${RPC_HOST} methods=[${methods.join(",")}]: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return Response.json(
      { error: "Upstream RPC unavailable." },
      { status: 502 },
    );
  }

  // A non-2xx from the provider (e.g. 401/403 on a suspended account, 429 on a
  // blown quota) is the #1 cause of a buy-flow break. Buffer the body so we can
  // log WHY, then forward it unchanged. Non-2xx is rare, so this costs nothing
  // on the hot path.
  if (!upstream.ok) {
    const text = await upstream.text();
    console.error(
      `[rpc] upstream ${upstream.status} host=${RPC_HOST} methods=[${methods.join(
        ",",
      )}] body=${text.slice(0, 300)}`,
    );
    return new Response(text, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
