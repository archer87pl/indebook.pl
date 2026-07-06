import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const properties = await prisma.property.findMany({
    where: { unitTypes: { some: {} } },
    select: { slug: true },
  });
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/rejestracja`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/moja-rezerwacja`, changeFrequency: "monthly", priority: 0.3 },
    ...properties.flatMap((p) => [
      {
        url: `${base}/o/${p.slug}`,
        changeFrequency: "daily" as const,
        priority: 0.9,
      },
      {
        url: `${base}/o/${p.slug}/regulamin`,
        changeFrequency: "monthly" as const,
        priority: 0.2,
      },
    ]),
  ];
}
