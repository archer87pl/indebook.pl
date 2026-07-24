import { getTranslations } from "next-intl/server";
import type { SiteConfig } from "@/lib/site-config";
import { localePath } from "@/lib/locale-urls";
import SiteLangSwitcher from "./SiteLangSwitcher";
import type { SiteCtx } from "./SiteRenderer";

// Kotwice pokazywane w nawigacji (kolejność wg konfiguracji sekcji).
const NAV_KEYS: Record<string, string> = {
  about: "about",
  units: "units",
  gallery: "gallery",
  calendar: "calendar",
  attractions: "attractions",
  reviews: "reviews",
  contact: "contact",
};

export default async function SiteNav({ config, ctx }: { config: SiteConfig; ctx: SiteCtx }) {
  const t = await getTranslations({ locale: ctx.locale, namespace: "site" });
  const links = config.sections.filter((s) => s.enabled && NAV_KEYS[s.type]);
  // rezerwacja kontynuowana w tym samym języku co strona obiektu
  const bookHref = `${ctx.appUrl}${localePath(`/o/${ctx.property.slug}`, ctx.locale)}`;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--site-text)]/10 bg-[var(--site-bg)]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <a href="#top" className="flex min-w-0 items-center gap-2.5">
          {config.theme.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={config.theme.logoUrl} alt={ctx.property.name} className="h-9 w-auto" />
          ) : (
            <span className="truncate text-lg font-bold tracking-tight">
              {ctx.property.name}
            </span>
          )}
        </a>
        <nav className="hidden items-center gap-5 text-sm md:flex">
          {links.map((s) => (
            <a
              key={s.id}
              href={`#${s.type}`}
              className="text-[var(--site-muted)] transition-colors hover:text-[var(--site-text)]"
            >
              {t(`nav.${NAV_KEYS[s.type]}`)}
            </a>
          ))}
        </nav>
        <div className="flex flex-none items-center gap-2">
          <SiteLangSwitcher current={ctx.locale} />
          <a
            href={bookHref}
            className="rounded-full bg-[var(--site-primary)] px-4 py-2 text-sm font-semibold text-[var(--site-primary-text)] transition-opacity hover:opacity-90"
          >
            {t("book")}
          </a>
        </div>
      </div>
    </header>
  );
}
