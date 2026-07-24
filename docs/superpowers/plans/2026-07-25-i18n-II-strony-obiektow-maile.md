# i18n gościa — Plan II: strony WWW obiektów + e-maile/SMS — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Zlokalizować statyczny chrome stron WWW obiektów (cookie `SITE_LOCALE`, bez prefiksu — treść właściciela zostaje PL) oraz transakcyjne e-maile/SMS do gościa w jego języku (`Reservation.locale`).

**Wymaga:** Planu I (next-intl skonfigurowany, słowniki `messages/*`, namespace'y). Wg specu `docs/superpowers/specs/2026-07-25-i18n-guest-design.md`.

**Tech Stack:** Next.js 16.2, next-intl (`getTranslations` z jawnym locale), Prisma, vitest + playwright.

## Global Constraints

- Strony obiektów (`app/sites/[host]`) NIE przechodzą przez routing next-intl (rewrite hostów w `proxy.ts`) — locale z cookie `SITE_LOCALE` (`pl|en|de`, domyślnie `pl`).
- Lokalizujemy **tylko statyczny chrome** stron obiektów (nawigacja, stopka, widget kalendarza, formularz kontaktowy, domyślne tytuły sekcji). **Treść właściciela zostaje PL.**
- E-maile/SMS: `getTranslations({ locale, namespace })` z jawnym `locale = reservation.locale`. Do właściciela — PL.
- `Reservation.locale` domyślnie `"pl"` (istniejące rezerwacje). Ustawiane przy tworzeniu rezerwacji z aktualnego locale gościa.
- Waluta PLN (bez przewalutowania). Testy: vitest + playwright (stub/realny mailer loguje do konsoli bez klucza).
- Commity małe, po polsku.

---

### Task 1: `Reservation.locale` + zapis języka przy rezerwacji

**Files:** Modify: `prisma/schema.prisma`, `lib/actions.ts` (`createReservation`)

**Interfaces (Produces):** `Reservation.locale String @default("pl")`.

- [ ] **Step 1:** Dodać do `model Reservation` pole `locale String @default("pl") // jezyk goscia: pl|en|de`. `npx prisma db push --skip-generate` + `npx prisma generate`.
- [ ] **Step 2:** `createReservation` — odczytać aktualne locale (`getLocale()` z `next-intl/server`) i zapisać w `data.locale` przy tworzeniu rezerwacji. (Formularz rezerwacji jest na trasie `[locale]`, więc `getLocale()` zwróci właściwy.)
- [ ] **Step 3:** Weryfikacja: rezerwacja z `/en/rezerwuj/…` zapisuje `locale="en"` (skrypt tsx sprawdzający ostatnią rezerwację). `npm run lint`.
- [ ] **Step 4:** Commit `Feat: i18n - Reservation.locale (jezyk goscia)`.

---

### Task 2: Lokalizacja e-maili/SMS do gościa

**Files:** Modify: `lib/actions.ts` (maile/SMS gościa), `lib/jobs.ts` (przypomnienia, prośby o opinię), `messages/*.json` (namespace `email`, `sms`)

**Interfaces:** helper `guestT(locale)` = `await getTranslations({ locale, namespace: "email" })` (i `"sms"`). Treści maili gościa budowane z `t()` z interpolacją (kod, daty, kwoty).

- [ ] **Step 1:** Dopisać do `pl.json` namespace `email` i `sms` z szablonami: potwierdzenie rezerwacji, link do meldunku, przypomnienie o przyjeździe, prośba o opinię, anulowanie, zmiana terminu (z placeholderami `{code}`, `{checkIn}`, `{checkOut}`, `{amount}`, `{url}`). Tłumaczenia w `en/de`. Test kompletności kluczy (z Planu I) obejmuje nowe klucze.
- [ ] **Step 2:** Podmienić sztywne polskie treści maili/SMS **do gościa** na `getTranslations({ locale: reservation.locale, namespace })` w: potwierdzenie (`adminSetStatus` CONFIRMED / po utworzeniu), link do meldunku, `sendArrivalReminders` i `sendReviewRequests` (`lib/jobs.ts`), anulowanie (`cancelByGuest`/`adminSetStatus`), zmiana terminu (`changeReservationDates`). E-maile do **właściciela** (zapytania, powiadomienia) zostają PL.
- [ ] **Step 3:** Weryfikacja: utworzyć/potwierdzić rezerwację z `locale="de"` → w logu maila (`[MAIL]`) treść po niemiecku (skrypt tsx + `CHANNEX_STUB` niepotrzebne; mailer loguje bez klucza Resend). `npm run lint`, vitest.
- [ ] **Step 4:** Commit `Feat: i18n - transakcyjne maile/SMS goscia w jego jezyku`.

---

### Task 3: Cookie języka + lokalizacja chrome stron obiektów

**Files:** Create: `lib/site-locale.ts`, `app/api/sites/locale/route.ts` (ustawienie cookie), `components/site/SiteLangSwitcher.tsx` (client); Modify: `components/site/SiteRenderer.tsx`, `SiteNav.tsx`, `SiteFooter.tsx`, `components/site/sections/AvailabilityCalendar.tsx`, `Contact.tsx`, `app/sites/[host]/page.tsx`; `messages/*.json` (namespace `site`)

**Interfaces (Produces):**
- `lib/site-locale.ts`: `getSiteLocale(): Promise<"pl"|"en"|"de">` (czyta cookie `SITE_LOCALE`, fallback `pl`).
- `POST /api/sites/locale` — ustawia cookie `SITE_LOCALE` (walidacja wartości) i zwraca 200; przełącznik woła go i odświeża stronę.
- `<SiteLangSwitcher current={locale} />` — client, PL/EN/DE.

- [ ] **Step 1:** Dopisać namespace `site` do słowników (nawigacja: „Zarezerwuj", kotwice; stopka; kalendarz: dni tygodnia, „Wybierz termin", „Zarezerwuj ten termin"; formularz kontaktowy: etykiety, „Wyślij zapytanie", komunikaty; domyślne tytuły sekcji). Tłumaczenia en/de. Test kompletności zielony.
- [ ] **Step 2:** `lib/site-locale.ts` + route `POST /api/sites/locale` (walidacja `pl|en|de`, cookie `SITE_LOCALE`, `path=/`, 1 rok).
- [ ] **Step 3:** `app/sites/[host]/page.tsx` — odczytać `getSiteLocale()`, przekazać `locale` do `SiteRenderer`; `getTranslations({ locale, namespace: "site" })` dla chrome. `SiteRenderer`/`SiteNav`/`SiteFooter`/`AvailabilityCalendar`/`Contact` — statyczne etykiety przez `t()`; **treść sekcji z konfiguracji właściciela bez zmian (PL)**.
- [ ] **Step 4:** `SiteLangSwitcher` w nawigacji strony obiektu — wybór woła `POST /api/sites/locale` i `location.reload()`. `<html lang>` strony obiektu z locale.
- [ ] **Step 5:** CTA „Zarezerwuj" na stronie obiektu → link do flow gościa na hoście aplikacji z prefiksem języka (`/en/o/slug` gdy `SITE_LOCALE=en`), żeby gość kontynuował w tym samym języku.
- [ ] **Step 6:** Weryfikacja w przeglądarce (opublikowana strona demo na subdomenie): przełącznik EN → nawigacja/kalendarz/formularz po angielsku, treść obiektu dalej PL; „Zarezerwuj" prowadzi na `/en/o/slug`. `npm run lint`, vitest.
- [ ] **Step 7:** Commit `Feat: i18n - chrome stron obiektow (cookie SITE_LOCALE)`.

---

### Task 4: e2e + dokumentacja

**Files:** Create/rozszerzyć: `tests/e2e/i18n.spec.ts`; Modify: `docs/FUNKCJE.md`

- [ ] **Step 1:** e2e: na opublikowanej stronie obiektu (subdomena `*.localhost:3100`) przełącznik EN → etykiety chrome EN, treść PL; „Zarezerwuj" → URL flow z `/en`. E-mail: test jednostkowy/logowy, że przy `reservation.locale="de"` szablon jest niemiecki (asercja na treści z `getTranslations`).
- [ ] **Step 2:** `docs/FUNKCJE.md` — uzupełnić sekcję i18n o strony obiektów (cookie, chrome) i maile gościa; zaznaczyć, że tłumaczenie treści właściciela to kolejny etap.
- [ ] **Step 3:** Pełne `npx vitest run`, `npm run lint`, `npx playwright test`, `npm run build` — zielone. Commit `Feat: i18n Plan II - strony obiektow, maile goscia, e2e, docs`.

---

## Self-review (Plan II)
- Pokrycie specu (reszta): `Reservation.locale` (T1), maile/SMS gościa w jego języku (T2), chrome stron obiektów + cookie + przełącznik + spójność CTA (T3), e2e + docs (T4).
- Spójność: `getSiteLocale`/`SITE_LOCALE` (T3) używane w rendererze i CTA; namespace `email`/`sms`/`site` dopisane do słowników z Planu I (test kompletności pilnuje en/de); `Reservation.locale` (T1) użyty w mailach (T2).
- Treść właściciela świadomie PL (tłumaczenie treści = osobny etap); waluta PLN bez przewalutowania.
