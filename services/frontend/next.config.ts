import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for a slim distroless-style runtime image.
  output: "standalone",
  // Product imagery is served from /public/img (local PNGs); no remote loader
  // needed today. When a CDN lands, add remotePatterns here.
  reactStrictMode: true,
};

export default nextConfig;
