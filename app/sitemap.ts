import type { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/blog";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const properties = await prisma.property.findMany({
    where: { unitTypes: { some: {} } },
    select: { slug: true },
  });
  const posts = getPublishedPosts();
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/rejestracja`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/moja-rezerwacja`, changeFrequency: "monthly", priority: 0.3 },
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(`${p.date}T00:00:00`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
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
