import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // wdrożenie: samodzielny serwer node (Dockerfile)
  output: "standalone",
  experimental: {
    serverActions: {
      // upload zdjęć obiektów/pokoi przez server actions
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
