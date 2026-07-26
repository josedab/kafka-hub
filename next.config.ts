import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();
const isDevelopment = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

function contentSecurityPolicy(frameAncestors: "'none'" | "*"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://plausible.io`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://plausible.io" + (isDevelopment ? " ws:" : ""),
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/search": ["./content/**/*.mdx"],
  },
  async headers() {
    const commonHeaders = [
      {
        key: "Content-Security-Policy",
        value: contentSecurityPolicy("'none'"),
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value:
          "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
      },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      {
        key: "X-Permitted-Cross-Domain-Policies",
        value: "none",
      },
      ...(isProduction
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains",
            },
          ]
        : []),
    ];

    return [
      {
        source: "/:path*",
        headers: commonHeaders,
      },
      {
        // Keep every route except the intentional iframe surface non-embeddable.
        source: "/:path((?!simulate/embed).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        // Later matching headers override the default CSP for embed responses.
        source: "/simulate/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy("*"),
          },
        ],
      },
    ];
  },
};

export default withMDX(nextConfig);
