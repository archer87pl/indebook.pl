// sitemap.xml strony WWW obiektu (per host — proxy przepisuje
// mojobiekt.pl/sitemap.xml na /sites/mojobiekt.pl/sitemap.xml).

import { siteUrl } from "@/lib/site-host";
import { getSiteByKey } from "@/lib/sites";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ host: string }> }
) {
  const { host } = await ctx.params;
  const site = await getSiteByKey(decodeURIComponent(host));
  if (!site?.publishedConfig || site.property.suspended) {
    return new Response("Not found", { status: 404 });
  }
  const url = siteUrl(site);
  const lastmod = (site.publishedAt ?? site.updatedAt).toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
  });
}
