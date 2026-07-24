// Budowanie adresów per język dla SEO (hreflang, canonical, sitemap).
// PL jest domyślny i nie ma prefiksu; EN/DE mają /en, /de.

import { routing, type AppLocale } from "@/i18n/routing";
import { appUrl } from "./payments";

/** Ścieżka w danym języku: „/o/willa" → „/en/o/willa" (PL bez prefiksu). */
export function localePath(path: string, locale: AppLocale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return locale === routing.defaultLocale ? clean : `/${locale}${clean}`;
}

/** Pełny URL ścieżki w danym języku. */
export function localeUrl(path: string, locale: AppLocale): string {
  return `${appUrl()}${localePath(path, locale)}`;
}

/**
 * Mapa języków dla `alternates.languages` w metadanych oraz dla sitemapy.
 * Zawiera wszystkie języki + `x-default` wskazujący wersję domyślną (PL).
 */
export function localeAlternates(path: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const locale of routing.locales) map[locale] = localeUrl(path, locale);
  map["x-default"] = localeUrl(path, routing.defaultLocale);
  return map;
}
