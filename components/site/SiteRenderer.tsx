// Renderer strony WWW obiektu — mapuje konfigurację sekcji na komponenty.
// Kolory/typografia idą przez zmienne CSS --site-* (themeVars), więc te same
// komponenty obsługują wszystkie szablony i palety.

import type { SiteConfig, SiteSection } from "@/lib/site-config";
import { themeVars } from "@/lib/site-themes";
import { sanitizeCss } from "@/lib/sanitize";
import { appUrl } from "@/lib/payments";
import type { SiteWithData } from "@/lib/sites";
import SiteNav from "./SiteNav";
import SiteFooter from "./SiteFooter";
import Hero from "./sections/Hero";
import About from "./sections/About";
import Units from "./sections/Units";
import Gallery from "./sections/Gallery";
import Amenities from "./sections/Amenities";
import CalendarSection from "./sections/Calendar";
import Attractions from "./sections/Attractions";
import Reviews from "./sections/Reviews";
import Contact from "./sections/Contact";
import CustomHtml from "./sections/CustomHtml";

export type SiteCtx = {
  property: SiteWithData["property"];
  appUrl: string;
  preview: boolean;
  /** klucz strony do API (subdomena) */
  siteKey: string;
};

function Section({ section, ctx }: { section: SiteSection; ctx: SiteCtx }) {
  switch (section.type) {
    case "hero":
      return <Hero section={section} ctx={ctx} />;
    case "about":
      return <About section={section} />;
    case "units":
      return <Units section={section} ctx={ctx} />;
    case "gallery":
      return <Gallery section={section} ctx={ctx} />;
    case "amenities":
      return <Amenities section={section} ctx={ctx} />;
    case "calendar":
      return <CalendarSection section={section} ctx={ctx} />;
    case "attractions":
      return <Attractions section={section} />;
    case "reviews":
      return <Reviews section={section} ctx={ctx} />;
    case "contact":
      return <Contact section={section} ctx={ctx} />;
    case "customHtml":
      return <CustomHtml section={section} />;
  }
}

export default function SiteRenderer({
  site,
  config,
  preview = false,
}: {
  site: SiteWithData;
  config: SiteConfig;
  preview?: boolean;
}) {
  const ctx: SiteCtx = {
    property: site.property,
    appUrl: appUrl(),
    preview,
    siteKey: site.subdomain,
  };
  const sections = config.sections.filter((s) => s.enabled);
  const vars = themeVars(config.theme, site.template);

  return (
    <div
      style={{ ...vars, fontFamily: "var(--site-font)" } as React.CSSProperties}
      className="min-h-screen bg-[var(--site-bg)] text-[var(--site-text)]"
    >
      {site.customCss && (
        <style dangerouslySetInnerHTML={{ __html: sanitizeCss(site.customCss) }} />
      )}
      <SiteNav config={config} ctx={ctx} />
      <main>
        {sections.map((s) => (
          <Section key={s.id} section={s} ctx={ctx} />
        ))}
      </main>
      <SiteFooter ctx={ctx} />
    </div>
  );
}
