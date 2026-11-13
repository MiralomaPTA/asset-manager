import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is fully dynamic and sign-in gated, so the classic dynamic
  // rendering model is simpler than Cache Components here.
  cacheComponents: false,
  experimental: {
    serverActions: {
      // Item and return photos are sent with their forms. The browser shrinks
      // them to 1600 px first (a few hundred KB); this stays under Vercel's
      // 4.5 MB request limit.
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    // Pin the root: a stray package-lock.json higher up would otherwise be taken for it.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
