import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // sharp is used server-side for upload processing; keep it out of the bundle.
  serverExternalPackages: ["sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Private, per-user pages must never be stored by shared caches.
      {
        source: "/(account|messages|admin|sell|listings|marketplace|search|categories)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      { source: "/admin", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  async redirects() {
    return [
      { source: "/admin/audit", destination: "/admin/audit-logs", permanent: false },
      { source: "/admin/policy", destination: "/admin/moderation", permanent: false },
    ];
  },
};

export default nextConfig;
