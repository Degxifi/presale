import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image only carries what the server actually needs.
  output: "standalone",
  // Pin the workspace root to THIS folder. Without it, a stray lockfile in a
  // parent dir (e.g. ~/package-lock.json) makes Turbopack infer the home dir as
  // root and try to index it on every request — dev then hangs. See the
  // "inferred your workspace root" warning.
  turbopack: { root: path.resolve(__dirname) },
  // DEV-ONLY: allow ngrok tunnels to load /_next/* dev resources (HMR, client
  // chunks, image optimizer). Without this, `next dev` over an ngrok URL blocks
  // those cross-origin requests, so client components (tier cards) don't hydrate
  // and images don't load. No effect on production (same-origin). Wildcards keep
  // it working as ngrok's random subdomain changes between sessions.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
  // Presale is sold out → land everyone straight on the claim page instead of the
  // marketing landing, so users don't have to find "Claim" in the menu. Temporary
  // (307) so it's easy to revert later; the landing page file is untouched and the
  // /how-it-works, /tokenomics, /faq pages are still reachable from the nav.
  async redirects() {
    return [{ source: "/", destination: "/claim", permanent: false }];
  },
};

export default nextConfig;
