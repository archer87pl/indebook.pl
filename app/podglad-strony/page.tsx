// Podgląd wersji roboczej strony WWW obiektu — tylko dla zalogowanego
// właściciela. Celowo poza layoutami (site)/admin: renderuje czystą stronę
// jak na docelowej domenie (ładowany w iframie edytora i w osobnej karcie).

import { notFound } from "next/navigation";
import SiteRenderer from "@/components/site/SiteRenderer";
import { requireOwner } from "@/lib/auth";
import { normalizeConfig } from "@/lib/site-config";
import { getSiteForProperty } from "@/lib/sites";

export const dynamic = "force-dynamic";

export default async function SitePreviewPage() {
  const { property } = await requireOwner();
  const site = await getSiteForProperty(property.id);
  if (!site) notFound();
  return <SiteRenderer site={site} config={normalizeConfig(site.draftConfig)} preview />;
}
