import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright"],
  outputFileTracingIncludes: {
    "/api/monitor": ["./node_modules/playwright-core/.local-browsers/**"],
  },
};

export default nextConfig;
