import { defineRouting } from "next-intl/routing";

// Języki interfejsu gościa. PL domyślny i bez prefiksu w URL (as-needed),
// EN/DE z prefiksem: /en/o/slug, /de/o/slug. Panel recepcji zostaje po polsku.
export const routing = defineRouting({
  locales: ["pl", "en", "de"],
  defaultLocale: "pl",
  localePrefix: "as-needed",
  localeDetection: true,
});

export type AppLocale = (typeof routing.locales)[number];

export function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}
