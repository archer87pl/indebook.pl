// Które ścieżki aplikacji należą do interfejsu gościa (i mają być
// lokalizowane przez next-intl). Panel recepcji, superadmin, landing i API
// zostają po polsku, bez prefiksu języka.

import { routing } from "@/i18n/routing";

const GUEST_PREFIXES = ["/o", "/rezerwuj", "/r", "/moja-rezerwacja", "/blog"];

// prefiksy języków innych niż domyślny, np. /en, /de
const LOCALE_PREFIX_RE = new RegExp(
  `^/(${routing.locales.filter((l) => l !== routing.defaultLocale).join("|")})(?=/|$)`
);

/** Ścieżka bez prefiksu języka (np. „/en/o/x" → „/o/x"). */
export function stripLocalePrefix(pathname: string): string {
  return pathname.replace(LOCALE_PREFIX_RE, "") || "/";
}

/** Czy ścieżka należy do interfejsu gościa (z prefiksem języka lub bez). */
export function isGuestPath(pathname: string): boolean {
  const stripped = stripLocalePrefix(pathname);
  return GUEST_PREFIXES.some((p) => stripped === p || stripped.startsWith(`${p}/`));
}
