/**
 * Server-side Solana RPC proxy. The browser's wallet/connection calls hit this
 * same-origin route, which forwards JSON-RPC to the real provider using the
 * SERVER-ONLY `SOLANA_RPC_URL` (with the provider key). The key is never sent
 * to the client.
 *
 * TODO(hardening): add rate limiting / method allowlist before mainnet launch.
 */

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export async function POST(request: Request) {
  // Deter cross-site browser abuse of our RPC quota (server callers can spoof,
  // so this is a deterrent, not airtight — pair with rate limiting in prod).
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await request.text();
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
