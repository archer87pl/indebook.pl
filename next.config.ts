import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone tylko pod Docker/self-host; na Vercel (serverless) niepotrzebne
  output: process.env.VERCEL ? undefined : "standalone",
  experimental: {
    serverActions: {
      // upload zdjęć obiektów/pokoi przez server actions
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
