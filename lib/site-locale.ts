// Język stron WWW obiektów. Te strony nie przechodzą przez routing next-intl
// (proxy przepisuje host na /sites/<klucz>), więc język trzymamy w cookie —
// bez prefiksu w URL. Tłumaczymy tylko statyczny chrome; treść właściciela
// (opisy, sekcje) zostaje w oryginale.

import { cookies } from "next/headers";
import { routing, type AppLocale, isAppLocale } from "@/i18n/routing";

export const SITE_LOCALE_COOKIE = "SITE_LOCALE";

export async function getSiteLocale(): Promise<AppLocale> {
  const store = await cookies();
  const value = store.get(SITE_LOCALE_COOKIE)?.value ?? "";
  return isAppLocale(value) ? value : routing.defaultLocale;
}
