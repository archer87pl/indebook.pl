import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone tylko pod Docker/self-host; na Vercel (serverless) niepotrzebne
  output: process.env.VERCEL ? undefined : "standalone",
  // nie ujawniaj frameworka
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // upload zdjęć obiektów/pokoi przez server actions
      bodySizeLimit: "8mb",
    },
  },
  // Nagłówki bezpieczeństwa dla całej aplikacji. Świadomie bez CSP —
  // strony WWW obiektów renderują własny HTML/CSS użytkowników oraz embedy
  // (Google Maps, YouTube), które globalny CSP by zepsuł; XSS blokujemy
  // sanityzacją treści przy renderze.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
