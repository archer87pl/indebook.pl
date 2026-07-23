// Helpery DB modułu „Strona WWW" — rozwiązywanie strony po hoście
// i ścieżki do rewalidacji cache po publikacji.

import type { Photo, Property, PropertyFaq, Site, Unit, UnitType } from "@prisma/client";
import { prisma } from "./db";

export type SiteWithData = Site & {
  property: Property & {
    photos: Photo[];
    faqs: PropertyFaq[];
    unitTypes: (UnitType & { units: Unit[]; photos: Photo[] })[];
  };
};

const SITE_INCLUDE = {
  property: {
    include: {
      photos: { where: { propertyId: { not: null } }, orderBy: { id: "asc" as const } },
      faqs: { orderBy: [{ sort: "asc" as const }, { id: "asc" as const }] },
      unitTypes: {
        include: { units: true, photos: { orderBy: { id: "asc" as const } } },
        orderBy: { id: "asc" as const },
      },
    },
  },
};

// key = subdomena („willa") albo pełna domena własna („mojobiekt.pl",
// dopasowywana też bez prefiksu www — classifyHost już go zdejmuje).
// Domena własna liczy się tylko po weryfikacji (VERIFIED) — niezweryfikowany
// claim nie może serwować cudzej treści ani być użyty do przechwycenia ruchu.
export async function getSiteByKey(key: string): Promise<SiteWithData | null> {
  return prisma.site.findFirst({
    where: {
      OR: [{ subdomain: key }, { customDomain: key, domainStatus: "VERIFIED" }],
    },
    include: SITE_INCLUDE,
  });
}

export async function getSiteForProperty(propertyId: number): Promise<SiteWithData | null> {
  return prisma.site.findUnique({ where: { propertyId }, include: SITE_INCLUDE });
}

// Ścieżki wewnętrzne do revalidatePath po publikacji / zmianie adresu.
export function siteRevalidatePaths(site: {
  subdomain: string;
  customDomain: string | null;
}): string[] {
  const paths = [`/sites/${site.subdomain}`];
  if (site.customDomain) paths.push(`/sites/${site.customDomain}`);
  return paths;
}
