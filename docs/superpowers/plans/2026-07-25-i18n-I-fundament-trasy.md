# i18n gościa — Plan I: fundament next-intl + trasy gościa — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Wprowadzić next-intl (PL/EN/DE, prefiks `as-needed`, auto-detekcja, przełącznik, SEO) i zlokalizować trasy gościa aplikacji (`/o`, `/rezerwuj`, `/r`, `/moja-rezerwacja`, `/blog`) przenosząc je pod `app/[locale]/`, bez ruszania panelu/superadmina/landingu.

**Architecture:** `next-intl` z segmentem `app/[locale]/`, `localePrefix:"as-needed"`. Middleware next-intl **skomponowany w istniejącym `proxy.ts`** (host stron obiektów bez zmian). Słowniki `messages/<locale>.json` per namespace. Stringi UI przez `getTranslations`/`useTranslations`. Wg specu `docs/superpowers/specs/2026-07-25-i18n-guest-design.md`.

**Tech Stack:** Next.js 16.2 (App Router, `proxy.ts`, async params), next-intl, Prisma, Tailwind 4, vitest + playwright.

## Global Constraints

- Locales: `["pl","en","de"]`, `defaultLocale="pl"`, `localePrefix:"as-needed"` (PL bez prefiksu), `localeDetection:true`. PL = źródło prawdy komunikatów; `en/de` mają te same klucze.
- Lokalizujemy **tylko trasy gościa**: `/o`(+`pokoj`,`wyniki`,`regulamin`), `/rezerwuj`, `/r`(+`meldunek`,`opinia`), `/moja-rezerwacja`, `/blog`. **Nie ruszamy**: landing `/`, `/admin`, `/(auth)`, `/(site)/superadmin`, `/api`, `/sites/[host]`.
- `proxy.ts` jest jedynym middleware i jest load-bearing (host stron obiektów) — next-intl komponujemy w nim, nie zastępujemy.
- Next 16: `params`/`searchParams` to `Promise` (await); komponenty client dostają locale przez `NextIntlClientProvider` w `app/[locale]/layout.tsx`.
- Daty/waluty przez formatery next-intl; waluta zostaje PLN (bez przewalutowania). Liczba mnoga przez ICU (`{count, plural, one/few/other}`).
- Wzorce repo: server actions bez zmian (Plan I nie tłumaczy maili — to Plan II); teksty UI po podmianie idą przez `t()`.
- DB współdzielona z dev — nie odpalać `next build` przy działającym `next dev`. Testy: vitest (`lib/**`, `messages`), playwright (`tests/e2e`, port 3100).
- Commity małe, po polsku.

---

### Task 1: Instalacja i konfiguracja next-intl

**Files:**
- Modify: `package.json` (dep `next-intl`), `next.config.ts`
- Create: `i18n/routing.ts`, `i18n/navigation.ts`, `i18n/request.ts`, `messages/pl.json`, `messages/en.json`, `messages/de.json`

**Interfaces (Produces):**
- `i18n/routing.ts`: `export const routing = defineRouting({ locales: ["pl","en","de"], defaultLocale: "pl", localePrefix: "as-needed", localeDetection: true })`.
- `i18n/navigation.ts`: `export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)`.
- `i18n/request.ts`: `getRequestConfig` ładujący `../messages/${locale}.json`.

- [ ] **Step 1:** `npm i next-intl`.
- [ ] **Step 2:** `next.config.ts` — owinąć plugin:
```ts
import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
// ...istniejący nextConfig bez zmian...
export default withNextIntl(nextConfig);
```
- [ ] **Step 3:** `i18n/routing.ts`:
```ts
import { defineRouting } from "next-intl/routing";
export const routing = defineRouting({
  locales: ["pl", "en", "de"],
  defaultLocale: "pl",
  localePrefix: "as-needed",
  localeDetection: true,
});
```
- [ ] **Step 4:** `i18n/navigation.ts`:
```ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```
- [ ] **Step 5:** `i18n/request.ts`:
```ts
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
```
- [ ] **Step 6:** Utworzyć `messages/pl.json` = `{}` na start (napełnimy w kolejnych taskach), oraz kopie `en.json`, `de.json` = `{}`. `npm run lint` przechodzi.
- [ ] **Step 7:** Commit `Feat: i18n - instalacja i konfiguracja next-intl`.

---

### Task 2: Kompozycja next-intl w proxy.ts (bez psucia hostów)

**Files:** Modify: `proxy.ts`; Create: `proxy.i18n.test.ts` (lub rozszerzyć istniejące testy hostów — tu logika hostów bez zmian)

**Interfaces:** `proxy(request)` — kolejność: (1) `classifyHost`; strona obiektu → dotychczasowy rewrite `/sites/<key>` (bez i18n); (2) host aplikacji: jeśli ścieżka pasuje do tras gościa → `intlMiddleware(request)`; inaczej `NextResponse.next()` (panel/landing/api bez zmian).

- [ ] **Step 1:** Utworzyć `intlMiddleware` z `createMiddleware(routing)`:
```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
const intlMiddleware = createMiddleware(routing);
```
- [ ] **Step 2:** W `proxy()` po obsłudze hosta obiektu, dla hosta aplikacji rozpoznać trasy gościa i tylko dla nich wołać intl:
```ts
const GUEST_PREFIXES = ["/o", "/rezerwuj", "/r", "/moja-rezerwacja", "/blog"];
function isGuestPath(pathname: string): boolean {
  // usuń ewentualny prefiks locale (/en, /de) przed dopasowaniem
  const stripped = pathname.replace(/^\/(en|de)(?=\/|$)/, "");
  return GUEST_PREFIXES.some((p) => stripped === p || stripped.startsWith(`${p}/`));
}
```
w `proxy`: `if (kind.kind === "app") { return isGuestPath(request.nextUrl.pathname) ? intlMiddleware(request) : NextResponse.next(); }` (obsługa hosta obiektu bez zmian — zostaje wyżej).
- [ ] **Step 3:** Rozszerzyć `matcher` w `config`, by obejmował trasy gościa i ich prefiksy (`/`, `/(en|de)/…`), nadal wykluczając `_next/api/uploads/icon/favicon`. (Pozostaw obecne wykluczenia; dodaj, że trasy gościa muszą przechodzić przez middleware.)
- [ ] **Step 4:** Test czystej `isGuestPath` (`proxy.i18n.test.ts`): `/o/slug`→true, `/en/o/slug`→true, `/admin`→false, `/`→false, `/blog`→true, `/de/rezerwuj/1`→true. `npm run lint`.
- [ ] **Step 5:** `npm run build` przechodzi (kompozycja middleware poprawna). Commit `Feat: i18n - kompozycja next-intl w proxy (tylko trasy goscia)`.

---

### Task 3: Layout `[locale]` + przeniesienie tras gościa

**Files:**
- Create: `app/[locale]/layout.tsx`
- Move (`git mv`): `app/(site)/o` → `app/[locale]/o`; `app/(site)/rezerwuj` → `app/[locale]/rezerwuj`; `app/(site)/r` → `app/[locale]/r`; `app/(site)/moja-rezerwacja` → `app/[locale]/moja-rezerwacja`; `app/(site)/blog` → `app/[locale]/blog`
- Zostają w `(site)`: `page.tsx` (landing), `layout.tsx`, `superadmin/`

**Interfaces (Produces):** `app/[locale]/layout.tsx` — ustawia `<html lang>` przez `setRequestLocale`, renderuje `NextIntlClientProvider`, opakowuje wspólny chrome gościa (nagłówek z przełącznikiem języka — Task 6). Uwaga: root `app/layout.tsx` renderuje `<html>` — layout `[locale]` NIE duplikuje `<html>`, tylko ustawia locale i provider; `<html lang>` ustawiamy w root layout z `getLocale()`.

- [ ] **Step 1:** `git mv` katalogów gościa z `app/(site)/` do `app/[locale]/` (5 przeniesień). Zweryfikować, że w `(site)` zostają tylko `page.tsx`, `layout.tsx`, `superadmin/`.
- [ ] **Step 2:** `app/[locale]/layout.tsx`:
```tsx
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) notFound();
  setRequestLocale(locale);
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
```
- [ ] **Step 3:** `app/layout.tsx` (root) — `<html lang>` z aktywnego locale:
```tsx
import { getLocale } from "next-intl/server";
// w komponencie:
const locale = await getLocale();
return (<html lang={locale} className={...}> ... </html>);
```
(RootLayout staje się `async`.)
- [ ] **Step 4:** Wspólny chrome gościa (nagłówek/stopka z `app/(site)/layout.tsx`) — przenieść część gościa do `app/[locale]/layout.tsx` (nagłówek z logo + przełącznik języka w Task 6), zostawiając w `(site)/layout.tsx` chrome dla landingu. (Jeśli chrome był współdzielony, zduplikować minimalnie — landing PL, gość z przełącznikiem.)
- [ ] **Step 5:** `npm run build` — trasy gościa budują się pod `[locale]`; `/o/slug` (PL) i `/en/o/slug` odpowiadają. Ręczna weryfikacja w przeglądarce: `/o/<demo>` renderuje się (jeszcze po polsku, bez `t()`), `/en/o/<demo>` też (angielski dojdzie w Task 4–5).
- [ ] **Step 6:** Zaktualizować wewnętrzne linki do tras gościa na localized `Link` z `@/i18n/navigation` w przeniesionych stronach i w landing/katalogu (linki do `/o/slug`). Import `Link` z `@/i18n/navigation` zamiast `next/link` w komponentach gościa.
- [ ] **Step 7:** `npm run lint`, pełne e2e (guest-booking musi przejść — trasy działają, tylko po PL). Commit `Feat: i18n - layout [locale] i przeniesienie tras goscia`.

---

### Task 4: Słowniki + lokalizacja strony obiektu i wyników

**Files:**
- Modify: `messages/pl.json`, `en.json`, `de.json`; `app/[locale]/o/[slug]/page.tsx`, `app/[locale]/o/[slug]/pokoj/[unitTypeId]/page.tsx`, `app/[locale]/o/[slug]/wyniki/page.tsx`, `app/[locale]/o/[slug]/regulamin/page.tsx`, `components/SearchForm.tsx`
- Test: `messages/messages.test.ts`

**Interfaces:** namespace `property`, `search`, `common` w słownikach. Server: `const t = await getTranslations("property")`. Client `SearchForm`: `useTranslations("search")`.

- [ ] **Step 1:** Napełnić `pl.json` kluczami dla strony obiektu/wyników (nagłówki, „Udogodnienia", „Opinie gości", „od {price} / noc", „Zarezerwuj", „Przyjazd/Wyjazd/Goście", „Brak wolnych pokoi", plural `nights`). Skopiować strukturę do `en.json`/`de.json` z tłumaczeniami.
- [ ] **Step 2: Test kompletności kluczy** (`messages/messages.test.ts`):
```ts
import { describe, expect, it } from "vitest";
import pl from "./pl.json";
import en from "./en.json";
import de from "./de.json";
function keys(o: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}
describe("kompletność tłumaczeń", () => {
  it("en i de mają dokładnie te same klucze co pl", () => {
    const plk = keys(pl).sort();
    expect(keys(en).sort()).toEqual(plk);
    expect(keys(de).sort()).toEqual(plk);
  });
});
```
- [ ] **Step 3:** FAIL jeśli klucze niespójne → wyrównać → PASS.
- [ ] **Step 4:** Podmienić literały PL na `t("…")` w stronie obiektu, pokoju, wynikach, regulaminie i `SearchForm`. Ceny/daty przez formatery next-intl (`useFormatter`/`getFormatter`), waluta PLN.
- [ ] **Step 5:** `generateMetadata` strony obiektu: tytuł/opis z `getTranslations`, `alternates.languages` (pl/en/de + x-default) i `canonical` per locale (helper `localeAlternates(path)`).
- [ ] **Step 6:** Weryfikacja w przeglądarce: `/o/<demo>` po PL, `/en/o/<demo>` po EN (etykiety), `<head>` ma `hreflang`. `npm run lint`, vitest.
- [ ] **Step 7:** Commit `Feat: i18n - strona obiektu i wyniki (PL/EN/DE)`.

---

### Task 5: Lokalizacja rezerwacji, panelu gościa, meldunku, opinii, moja-rezerwacja

**Files:** Modify: `app/[locale]/rezerwuj/[unitTypeId]/page.tsx`, `app/[locale]/r/[code]/page.tsx` (+`meldunek`, `opinia`), `app/[locale]/moja-rezerwacja/page.tsx`, reużywane client-components (`components/SignaturePad.tsx`, `components/StarRating.tsx`, `components/ChatThread.tsx` jeśli używane przez gościa); `messages/*.json`

**Interfaces:** namespace `booking`, `guest`, `checkin`, `review`, `common`.

- [ ] **Step 1:** Dopisać klucze `booking/guest/checkin/review` do `pl.json` + tłumaczenia `en/de`; test kompletności dalej zielony.
- [ ] **Step 2:** Podmienić literały na `t()` w: rezerwacji (dane gościa, zaliczka, podsumowanie), panelu gościa (`/r/[code]` — status, zmiana terminu, anulowanie, czat), meldunku (pola, zgody, e-podpis), opinii (ocena, komentarz, wysyłka), moja-rezerwacja (formularz kod+e-mail). Client-components dostają teksty przez `useTranslations`.
- [ ] **Step 3:** `generateMetadata`/`<title>` tych stron zlokalizowane; `alternates` per locale gdzie publiczne.
- [ ] **Step 4:** Weryfikacja w przeglądarce: pełny flow rezerwacji w `/en/…` po angielsku; panel gościa `/en/r/<code>` po angielsku; meldunek/opinia EN. `npm run lint`, vitest.
- [ ] **Step 5:** Commit `Feat: i18n - rezerwacja, panel goscia, meldunek, opinia (PL/EN/DE)`.

---

### Task 6: Przełącznik języka + auto-detekcja + sitemap hreflang + e2e

**Files:** Create: `components/LangSwitcher.tsx`; Modify: `app/[locale]/layout.tsx` (wpięcie), `app/sitemap.ts`; Create: `tests/e2e/i18n.spec.ts`

**Interfaces:** `<LangSwitcher />` (client) — PL/EN/DE, `useRouter`/`usePathname` z `@/i18n/navigation` → przełącza ścieżkę na inny język (cookie `NEXT_LOCALE` ustawia next-intl).

- [ ] **Step 1:** `components/LangSwitcher.tsx`:
```tsx
"use client";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
const LABELS = { pl: "PL", en: "EN", de: "DE" } as const;
export default function LangSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="flex gap-1 text-xs font-semibold">
      {(["pl","en","de"] as const).map((l) => (
        <button key={l} onClick={() => router.replace(pathname, { locale: l })}
          className={l === locale ? "text-brand-700" : "text-slate-400 hover:text-slate-700"}>
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
```
- [ ] **Step 2:** Wpiąć `<LangSwitcher/>` w nagłówek `app/[locale]/layout.tsx`. Auto-detekcja działa z konfiguracji (`localeDetection:true`) — bez dodatkowego kodu.
- [ ] **Step 3:** `app/sitemap.ts` — dla tras gościa dodać wpisy per język z `alternates.languages` (hreflang). Landing/rejestracja/admin bez zmian.
- [ ] **Step 4:** e2e `tests/e2e/i18n.spec.ts`: (a) na `/o/<demo>` klik EN → URL `/en/o/<demo>`, etykieta „Amenities"/„Book" widoczna; (b) `page.request.get` z `Accept-Language: de` na `/o/<demo>` → 307/redirect na `/de/…` lub treść DE; (c) `<link rel="alternate" hreflang="en">` w `<head>`; (d) regresja: `/admin` po loginie dalej PL, bez prefiksu.
- [ ] **Step 5:** Pełne `npx vitest run`, `npm run lint`, `npx playwright test` — zielone; `npm run build`. Commit `Feat: i18n - przelacznik jezyka, auto-detekcja, sitemap hreflang, e2e`.

---

### Task 7: Dokumentacja

**Files:** Modify: `docs/FUNKCJE.md`, `README.md`

- [ ] **Step 1:** `docs/FUNKCJE.md` — akapit o wielojęzyczności gościa (PL/EN/DE, next-intl, prefiks as-needed, przełącznik, SEO hreflang); zaznaczyć, że panel/superadmin/landing PL, a treści właściciela i strony obiektów — Plan II/kolejne etapy.
- [ ] **Step 2:** `README.md` — wzmianka o i18n gościa i strukturze `messages/` + `app/[locale]/`.
- [ ] **Step 3:** Commit `Feat: i18n Plan I - dokumentacja`.

---

## Self-review (Plan I)
- Pokrycie specu (część aplikacji): next-intl config (T1), kompozycja w proxy tylko trasy gościa (T2), `[locale]` + przeprowadzka (T3), słowniki + strona obiektu/wyniki (T4), rezerwacja/panel gościa/meldunek/opinia (T5), przełącznik + auto-detekcja + SEO + e2e (T6), docs (T7). Strony obiektów (cookie-i18n) i e-maile/SMS gościa — Plan II.
- Spójność: `routing` (T1) używany w proxy (T2), navigation (T6), layout (T3); namespace słowników spójne T4↔T5; test kompletności kluczy pilnuje en/de.
- Ryzyka odnotowane: przeprowadzka `git mv` (T3) + podmiana `Link` na localized; regresja panelu PL pilnowana e2e (T6).
