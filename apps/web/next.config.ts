import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @floor/sdk ships TypeScript source (main: src/index.ts).
  transpilePackages: ["@floor/sdk"],
};

export default nextConfig;
