import type { NextConfig } from "next";
import { legacyRedirects } from "./src/content/redirects";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    // Phase 1A/1F: preserve search equity from the legacy tdrengineering.com
    // URLs. `statusCode: 301` rather than `permanent: true` because the latter
    // emits a 308, and the spec (§14) calls for permanent 301 redirects — which
    // is also what older crawlers and link checkers handle most predictably.
    return legacyRedirects.map((r) => ({
      source: r.from,
      destination: r.to,
      statusCode: 301,
    }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
