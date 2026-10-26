import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server actions carry forms and file imports, never whole manuscripts (the server reads
  // those from Liveblocks), so a small explicit limit is enough.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
