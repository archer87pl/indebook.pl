import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import AvailabilityCalendar from "@/components/site/sections/AvailabilityCalendar";
import { isAppLocale, routing, type AppLocale } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { localePath } from "@/lib/locale-urls";
import { appUrl } from "@/lib/payments";
import { normalizeConfig } from "@/lib/site-config";
import { themeVars } from "@/lib/site-themes";

/**
 * Widget kalendarza do osadzenia na WŁASNEJ stronie właściciela (iframe).
 *
 * Ramka zamiast skryptu: nie wymaga CORS, izoluje style (kalendarz nie rozjedzie
 * się od CSS-a cudzego szablonu) i wkleja się wszędzie tam, gdzie da się wstawić
 * HTML — WordPress, Wix, Squarespace.
 *
 * Zwolnienie z `X-Frame-Options` dotyczy WYŁĄCZNIE ścieżki /embed (patrz
 * next.config.ts). Reszta aplikacji, z panelem recepcji na czele, zostaje
 * z `SAMEORIGIN` — inaczej panel dałoby się osadzić w cudzej ramce i podstawić
 * właścicielowi kliknięcia.
 */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ unitTypeId: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export const metadata = { robots: { index: false, follow: false } };

export default async function EmbedCalendarPage({ params, searchParams }: Props) {
  const { unitTypeId: raw } = await params;
  const { lang } = await searchParams;
  const unitTypeId = Number(raw);
  if (!Number.isInteger(unitTypeId) || unitTypeId <= 0) notFound();

  const unitType = await prisma.unitType.findUnique({
    where: { id: unitTypeId },
    select: {
      id: true,
      name: true,
      property: {
        select: {
          suspended: true,
          site: { select: { template: true, publishedConfig: true } },
        },
      },
    },
  });

  // Ta sama bramka co w publicznym API dostępności: obiekt zawieszony albo
  // strona nieopublikowana nie wystawiają niczego. Inaczej widget byłby
  // furtką do danych, których właściciel jeszcze nie upublicznił.
  const site = unitType?.property.site;
  if (!unitType || unitType.property.suspended || !site?.publishedConfig) notFound();

  const locale: AppLocale = lang && isAppLocale(lang) ? lang : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "site" });
  const config = normalizeConfig(site.publishedConfig);

  return (
    <div
      // kolory z motywu strony obiektu — widget wygląda jak reszta jego witryny,
      // a nie jak wklejony obcy element
      style={themeVars(config.theme, site.template) as React.CSSProperties}
      className="bg-[var(--site-bg)] p-3 text-[var(--site-text)]"
    >
      <AvailabilityCalendar
        unitTypes={[{ id: unitType.id, name: unitType.name }]}
        appUrl={appUrl()}
        bookPath={localePath("/rezerwuj", locale)}
        // rezerwacja w nowej karcie — wewnątrz ramki otworzyłaby się
        // w okienku wielkości widgetu
        linkTarget="_blank"
        labels={{
          pickRoom: t("calendar.pickRoom"),
          prevMonth: t("calendar.prevMonth"),
          nextMonth: t("calendar.nextMonth"),
          hintStart: t("calendar.hintStart"),
          hintEnd: t("calendar.hintEnd"),
          bookThese: t("calendar.bookThese"),
          loadError: t("calendar.loadError"),
          weekdays: t("calendar.weekdays").split(","),
          months: t("calendar.months").split(","),
        }}
      />
    </div>
  );
}
