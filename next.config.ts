import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image only carries what the server actually needs.
  output: "standalone",
  // Pin the workspace root to THIS folder. Without it, a stray lockfile in a
  // parent dir (e.g. ~/package-lock.json) makes Turbopack infer the home dir as
  // root and try to index it on every request.
  turbopack: { root: path.resolve(__dirname) },
  // DEV-ONLY: allow ngrok tunnels to load /_next/* dev resources.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
};

export default nextConfig;
