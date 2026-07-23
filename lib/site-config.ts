// Konfiguracja strony WWW obiektu — struktura JSON trzymana w Site.draftConfig /
// Site.publishedConfig. Sekcje danych (units/gallery/amenities/calendar/reviews)
// trzymają tu wyłącznie ustawienia wyglądu; treść płynie na żywo z tabel RezOp.

import { siteTemplate } from "./site-themes";

export type SectionType =
  | "hero"
  | "about"
  | "units"
  | "gallery"
  | "amenities"
  | "calendar"
  | "attractions"
  | "reviews"
  | "contact"
  | "customHtml";

export type AttractionItem = { name: string; desc: string; distance: string };

export type SiteSection =
  | { id: string; type: "hero"; enabled: boolean; data: { headline: string; tagline: string; ctaLabel: string; photoId: number | null } }
  | { id: string; type: "about"; enabled: boolean; data: { title: string; html: string } }
  | { id: string; type: "units"; enabled: boolean; data: { title: string } }
  | { id: string; type: "gallery"; enabled: boolean; data: { title: string } }
  | { id: string; type: "amenities"; enabled: boolean; data: { title: string } }
  | { id: string; type: "calendar"; enabled: boolean; data: { title: string } }
  | { id: string; type: "attractions"; enabled: boolean; data: { title: string; items: AttractionItem[] } }
  | { id: string; type: "reviews"; enabled: boolean; data: { title: string } }
  | { id: string; type: "contact"; enabled: boolean; data: { title: string; intro: string } }
  | { id: string; type: "customHtml"; enabled: boolean; data: { html: string } };

export type SiteTheme = {
  palette: string;
  font: string;
  logoUrl: string | null;
  heroPhotoId: number | null;
};

export type SiteSeo = { title: string; description: string };

export type SiteConfig = { theme: SiteTheme; seo: SiteSeo; sections: SiteSection[] };

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Nagłówek (hero)",
  about: "O obiekcie",
  units: "Apartamenty / pokoje",
  gallery: "Galeria zdjęć",
  amenities: "Udogodnienia",
  calendar: "Kalendarz i cennik",
  attractions: "Atrakcje w okolicy",
  reviews: "Opinie gości",
  contact: "Kontakt i mapa",
  customHtml: "Własny kod (HTML)",
};

export function sid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function defaultData(type: SectionType): SiteSection["data"] {
  switch (type) {
    case "hero":
      return { headline: "", tagline: "", ctaLabel: "Zarezerwuj pobyt", photoId: null };
    case "about":
      return { title: "O obiekcie", html: "" };
    case "units":
      return { title: "Nasze apartamenty" };
    case "gallery":
      return { title: "Galeria" };
    case "amenities":
      return { title: "Udogodnienia" };
    case "calendar":
      return { title: "Dostępność i ceny" };
    case "attractions":
      return { title: "Atrakcje w okolicy", items: [] };
    case "reviews":
      return { title: "Opinie naszych gości" };
    case "contact":
      return { title: "Kontakt", intro: "" };
    case "customHtml":
      return { html: "" };
  }
}

export function newSection(type: SectionType): SiteSection {
  return { id: sid(), type, enabled: true, data: defaultData(type) } as SiteSection;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);

function normalizeSection(raw: unknown): SiteSection | null {
  if (!isRecord(raw)) return null;
  const type = raw.type as SectionType;
  if (!(type in SECTION_LABELS)) return null;
  const defaults = defaultData(type) as Record<string, unknown>;
  const rawData = isRecord(raw.data) ? raw.data : {};
  const data: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in rawData) {
      const dv = defaults[key];
      const rv = rawData[key];
      if (typeof dv === "string") data[key] = typeof rv === "string" ? rv : dv;
      else if (Array.isArray(dv)) data[key] = Array.isArray(rv) ? rv : dv;
      else data[key] = rv ?? dv; // photoId: number | null
    }
  }
  if (type === "attractions") {
    data.items = (data.items as unknown[])
      .filter(isRecord)
      .map((i) => ({ name: str(i.name, ""), desc: str(i.desc, ""), distance: str(i.distance, "") }))
      .filter((i) => i.name);
  }
  return {
    id: str(raw.id, sid()),
    type,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    data,
  } as SiteSection;
}

export function normalizeConfig(raw: unknown): SiteConfig {
  const r = isRecord(raw) ? raw : {};
  const theme = isRecord(r.theme) ? r.theme : {};
  const seo = isRecord(r.seo) ? r.seo : {};
  const sections = Array.isArray(r.sections)
    ? r.sections.map(normalizeSection).filter((s): s is SiteSection => s !== null)
    : [];
  return {
    theme: {
      palette: str(theme.palette, "czysty"),
      font: str(theme.font, "sans"),
      logoUrl: typeof theme.logoUrl === "string" ? theme.logoUrl : null,
      heroPhotoId: typeof theme.heroPhotoId === "number" ? theme.heroPhotoId : null,
    },
    seo: { title: str(seo.title, ""), description: str(seo.description, "") },
    sections,
  };
}

// Minimalny wycinek danych obiektu potrzebny do prefillu (strukturalnie,
// bez zależności od typów Prismy — łatwiej testować).
export type PropertyPrefill = {
  name: string;
  description: string;
  address: string;
  slug: string;
  photos: { id: number }[];
  unitTypes: { id: number }[];
};

export function buildDefaultConfig(property: PropertyPrefill, templateKey: string): SiteConfig {
  const template = siteTemplate(templateKey);
  const heroSection = newSection("hero");
  if (heroSection.type === "hero") {
    heroSection.data.headline = property.name;
    heroSection.data.tagline = "Zarezerwuj pobyt bezpośrednio — bez prowizji pośredników.";
    heroSection.data.photoId = property.photos[0]?.id ?? null;
  }
  const aboutSection = newSection("about");
  if (aboutSection.type === "about") {
    aboutSection.data.html = property.description
      ? `<p>${property.description.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`
      : "";
  }
  const attractions = newSection("attractions");
  attractions.enabled = false;

  return {
    theme: {
      palette: template.defaultPalette,
      font: template.defaultFont,
      logoUrl: null,
      heroPhotoId: property.photos[0]?.id ?? null,
    },
    seo: {
      title: property.name,
      description: property.description.slice(0, 155),
    },
    sections: [
      heroSection,
      aboutSection,
      newSection("units"),
      newSection("gallery"),
      newSection("amenities"),
      newSection("calendar"),
      attractions,
      newSection("reviews"),
      newSection("contact"),
    ],
  };
}
