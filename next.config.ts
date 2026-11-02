import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];
const privateHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["razorpay", "pg", "nodemailer"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["/admin/:path*", "/account/:path*", "/checkout/:path*", "/booking/:path*", "/manage-booking/:path*", "/documents/:path*", "/demo/:path*", "/api/:path*"].map((source) => ({
        source,
        headers: privateHeaders,
      })),
    ];
  },
  async redirects() {
    // Legacy URLs from the previous single-page site (roomtogo.in/index.html with #anchors).
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/index.php", destination: "/", permanent: true },
      { source: "/rooms.html", destination: "/rooms", permanent: true },
      { source: "/gallery.html", destination: "/gallery", permanent: true },
      { source: "/contact.html", destination: "/contact", permanent: true },
      { source: "/about.html", destination: "/about", permanent: true },
    ];
  },
};

export default nextConfig;
