import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

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
    const wspolne = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];
    return [
      {
        // wszystko POZA /embed — wzorzec z negatywnym wyprzedzeniem, bo
        // `X-Frame-Options` nie ma wartości „zezwól wszystkim": jedyny sposób,
        // by ramka zadziałała, to w ogóle nie wysłać tego nagłówka
        source: "/((?!embed/).*)",
        headers: [...wspolne, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // Widget kalendarza osadzany na stronie właściciela. BEZ
        // `X-Frame-Options` i z `frame-ancestors *` — świadomie tylko tutaj.
        // Ta trasa nie ma sesji ani formularzy, więc nie ma czego przechwycić
        // kliknięciem; panel recepcji zostaje po drugiej stronie reguły wyżej.
        source: "/embed/:path*",
        headers: [
          ...wspolne,
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
