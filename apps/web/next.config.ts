import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @floor/sdk ships TypeScript source (main: src/index.ts).
  transpilePackages: ["@floor/sdk"],
  // Always defined at build time ("0" in production) so every NEXT_PUBLIC_LOCAL_DEV branch is folded away and the local-dev wallet is not in the bundle.
  env: { NEXT_PUBLIC_LOCAL_DEV: process.env.NEXT_PUBLIC_LOCAL_DEV === "1" ? "1" : "0" },
};

export default nextConfig;
