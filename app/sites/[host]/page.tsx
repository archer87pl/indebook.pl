import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import SiteRenderer from "@/components/site/SiteRenderer";
import { formatPln } from "@/lib/format";
import { normalizeConfig } from "@/lib/site-config";
import { siteUrl } from "@/lib/site-host";
import { getSiteByKey } from "@/lib/sites";

// ISR: strony obiektów serwowane z cache jak statyczne; publikacja w panelu
// woła revalidatePath(siteRevalidatePaths). Widget kalendarza dociąga
// dostępność na żywo przez /api/sites/availability.
export const revalidate = 300;

export async function generateMetadata(props: {
  params: Promise<{ host: string }>;
}): Promise<Metadata> {
  const { host } = await props.params;
  const site = await getSiteByKey(decodeURIComponent(host));
  if (!site?.publishedConfig || site.property.suspended) return {};
  const config = normalizeConfig(site.publishedConfig);
  const p = site.property;
  const title = config.seo.title || p.name;
  const description =
    config.seo.description || `${p.name}${p.address ? ` — ${p.address}` : ""}. Rezerwuj bezpośrednio online.`;
  const heroPhoto =
    p.photos.find((ph) => ph.id === config.theme.heroPhotoId) ?? p.photos[0];
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: siteUrl(site) },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "pl_PL",
      siteName: p.name,
      images: heroPhoto ? [{ url: heroPhoto.path }] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicSitePage(props: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await props.params;
  const site = await getSiteByKey(decodeURIComponent(host));
  if (!site?.publishedConfig) notFound();

  if (site.property.suspended) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Construction size={26} strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold">Strona chwilowo niedostępna</h1>
          <p className="text-sm text-slate-600">
            Strona obiektu {site.property.name} jest tymczasowo wyłączona. Zapraszamy wkrótce.
          </p>
        </div>
      </div>
    );
  }

  const config = normalizeConfig(site.publishedConfig);
  const p = site.property;
  const prices = p.unitTypes.map((ut) => ut.basePriceGr);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: p.name,
    url: siteUrl(site),
    address: p.address || undefined,
    image: p.photos.slice(0, 5).map((ph) => ph.path),
    priceRange: prices.length > 0 ? `od ${formatPln(Math.min(...prices))} / noc` : undefined,
    checkinTime: p.checkInFrom,
    checkoutTime: p.checkOutTo,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteRenderer site={site} config={config} />
    </>
  );
}
