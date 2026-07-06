import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/payments";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/superadmin", "/api/", "/r/", "/rezerwuj/", "/login"],
    },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
