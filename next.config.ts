import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright"],
  outputFileTracingIncludes: {
    "/api/monitor/route": ["./node_modules/playwright-core/.local-browsers/chromium_headless_shell-*/**"],
  },
};

export default nextConfig;
