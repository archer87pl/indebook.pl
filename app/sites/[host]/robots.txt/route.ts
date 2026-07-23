// robots.txt strony WWW obiektu (per host).

import { siteUrl } from "@/lib/site-host";
import { getSiteByKey } from "@/lib/sites";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ host: string }> }
) {
  const { host } = await ctx.params;
  const site = await getSiteByKey(decodeURIComponent(host));
  if (!site?.publishedConfig || site.property.suspended) {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { "Content-Type": "text/plain" },
    });
  }
  const body = `User-agent: *
Allow: /

Sitemap: ${siteUrl(site)}/sitemap.xml
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=3600" },
  });
}
