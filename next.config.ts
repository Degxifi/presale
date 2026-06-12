import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // runtime image only carries what the server actually needs.
  output: "standalone",
};

export default nextConfig;
