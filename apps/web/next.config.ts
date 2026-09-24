import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Vercel uses the existing manifest fallback, not the local release gateway.
    NEXT_PUBLIC_RELEASE_GATEWAY: process.env.NEXT_PUBLIC_RELEASE_GATEWAY ?? (process.env.VERCEL === "1" ? "false" : "true"),
  },
  async rewrites() {
    const origin = (process.env.NEXT_PUBLIC_API_URL || "https://task-management-api-lyart.vercel.app").replace(/\/+$/, "");
    const api = origin.endsWith("/api") ? origin : `${origin}/api`;
    // Same-origin browser requests retain the existing Bearer authentication.
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
};

export default nextConfig;
