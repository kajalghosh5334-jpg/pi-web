import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join, resolve } from "path";

const codingAgentPackageDir = resolve(__dirname, "../pi-backend/packages/coding-agent");

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  const piPkgPath = join(codingAgentPackageDir, "package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

const serverExternalPackages = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-ai/compat",
];

const nextConfig: NextConfig = {
  serverExternalPackages,
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*"],
  turbopack: {
    root: __dirname,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push(...serverExternalPackages);
    }
    return config;
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
