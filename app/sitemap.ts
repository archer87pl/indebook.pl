import type { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/blog";
import { prisma } from "@/lib/db";
import { localeAlternates, localeUrl } from "@/lib/locale-urls";
import { appUrl } from "@/lib/payments";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * Wpis sitemapy dla trasy gościa: osobny URL per język + hreflang w
 * `alternates.languages`, żeby Google podał właściwą wersję językową.
 */
function guestEntries(
  path: string,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  priority: number
): MetadataRoute.Sitemap {
  const languages = localeAlternates(path);
  return routing.locales.map((locale) => ({
    url: localeUrl(path, locale),
    changeFrequency,
    priority,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const properties = await prisma.property.findMany({
    where: { unitTypes: { some: {} } },
    select: { slug: true },
  });
  const posts = getPublishedPosts();
  return [
    // landing i blog zostają po polsku (treść marketingowa / pliki .md)
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/rejestracja`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(`${p.date}T00:00:00`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // trasy gościa — wielojęzyczne
    ...guestEntries("/moja-rezerwacja", "monthly", 0.3),
    ...properties.flatMap((p) => [
      ...guestEntries(`/o/${p.slug}`, "daily", 0.9),
      ...guestEntries(`/o/${p.slug}/regulamin`, "monthly", 0.2),
    ]),
  ];
}
