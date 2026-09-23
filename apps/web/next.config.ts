import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const origin = (process.env.NEXT_PUBLIC_API_URL || "https://task-management-api-lyart.vercel.app").replace(/\/+$/, "");
    const api = origin.endsWith("/api") ? origin : `${origin}/api`;
    // Same-origin browser requests retain the existing Bearer authentication.
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
};

export default nextConfig;
