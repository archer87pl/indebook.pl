# Wielojęzyczność interfejsu gościa (PL/EN/DE)

Data: 2026-07-25 · Status: zaakceptowany przez właściciela projektu

## Cel

Udostępnić gościom obiektów interfejs w PL, EN i DE na publicznych powierzchniach
RezFlow (flow rezerwacji, panel gościa, meldunek, opinie) oraz statyczny chrome
stron WWW obiektów. Panel recepcji, superadmin i landing pozostają po polsku.
Statyczne stringi UI są tłumaczone teraz; treści właściciela (opisy) — w kolejnym etapie.

## Decyzje kluczowe (ustalone z właścicielem)

1. **Języki:** `pl` (domyślny), `en`, `de`. Architektura gotowa na kolejne.
2. **Mechanizm:** `next-intl` z `localePrefix: 'as-needed'` (PL na `/`, EN/DE z prefiksem).
3. **Zakres:** flow gościa + panel gościa + statyczny chrome stron WWW obiektów.
   Landing (marketing), blog treść, panel recepcji, superadmin — PL.
4. **Wybór języka:** prefiks w URL + auto-detekcja (`Accept-Language`) + przełącznik (cookie).
5. **Treści:** tłumaczymy statyczne UI; treści właściciela zostają w oryginale (PL) —
   tłumaczenie treści to osobny etap (architektura na to gotowa).

## Architektura

`next-intl`, jedna nowa zależność. Locales `["pl","en","de"]`, `defaultLocale = "pl"`,
`localePrefix: "as-needed"`, `localeDetection: true`. Konfiguracja: `i18n/routing.ts`
(defineRouting), `i18n/navigation.ts` (localized `Link`/`useRouter`/`usePathname`/
`redirect`), `i18n/request.ts` (getRequestConfig — ładowanie `messages/<locale>.json`).

### Routing i segment `[locale]`

next-intl z prefiksem wymaga segmentu `app/[locale]/…`. Lokalizujemy **tylko trasy
gościa**, przenosząc je pod `[locale]`:
- **Lokalizowane** → `app/[locale]/o/[slug]/…` (+ `pokoj`, `wyniki`, `regulamin`),
  `app/[locale]/rezerwuj/[unitTypeId]`, `app/[locale]/r/[code]/…` (+ `meldunek`, `opinia`),
  `app/[locale]/moja-rezerwacja`, `app/[locale]/blog/…`.
- **Bez zmian, PL** → `app/admin/…`, `app/(auth)/…`, `app/(site)/superadmin/…`,
  `app/api/…`, landing `app/(site)/page.tsx` (`/`), `app/sites/[host]/…` (strony obiektów).

Przeprowadzka to zmiana lokalizacji plików w drzewie + podmiana literałów na `t()` —
bez zmian logiki tras. `<html lang>` renderuje się z aktywnego locale w layoucie `[locale]`.

### Kompozycja z `proxy.ts` (jeden middleware, load-bearing)

Rozszerzamy istniejący `proxy.ts`:
1. `classifyHost(host)` jak dziś.
2. **Strona obiektu** (subdomain/custom) → dotychczasowy rewrite na `/sites/[host]`,
   **bez** routingu next-intl (język stron obiektów: cookie + przełącznik, niżej).
3. **Host aplikacji** → middleware next-intl **tylko dla tras gościa**
   (matcher `/o`, `/rezerwuj`, `/r`, `/moja-rezerwacja`, `/blog` oraz ich prefiksy
   `/en/…`, `/de/…`); landing `/`, `/admin`, `/superadmin`, `/api`, `/_next` —
   omijają i18n (zostają PL bez prefiksu).

`proxy.ts` pozostaje jedynym punktem routingu; host stron obiektów działa jak dziś.

## Słowniki i użycie

`messages/pl.json` (źródło prawdy), `en.json`, `de.json` — te same klucze,
namespace = powierzchnia: `common`, `property`, `search`, `booking`, `guest`,
`checkin`, `review`, `site`, `email`, `sms`. Przykład:
```json
{
  "common": { "book": "Zarezerwuj", "nights": "{count, plural, one {# noc} few {# noce} other {# nocy}}" },
  "search": { "checkIn": "Przyjazd", "checkOut": "Wyjazd", "noResults": "Brak wolnych pokoi…" }
}
```
Użycie: server `const t = await getTranslations("property")`; client
`const t = useTranslations("search")` (locale z `NextIntlClientProvider` w layoucie
`[locale]`). Liczba mnoga/daty przez ICU MessageFormat i formatery next-intl (waluta
zostaje PLN, zmienia się tylko format). Typowanie: `en.json` jako bazowy typ
`IntlMessages` → literówki kluczy łapie TS.

## Przełącznik, auto-detekcja, SEO

- **Przełącznik** w nawigacji gościa: PL/EN/DE, używa localized `Link`/`useRouter`
  z `i18n/navigation` (ta sama ścieżka w innym języku + cookie `NEXT_LOCALE`).
  Lokalizowany `Link` sam dokłada prefiks do wewnętrznych linków flow gościa.
- **Auto-detekcja:** przy pierwszej wizycie bez cookie — `Accept-Language` →
  najlepsze z `[pl,en,de]` (fallback PL). Po wyborze cookie ma pierwszeństwo.
- **SEO:** `generateMetadata` tras gościa dodaje `alternates.languages`
  (`pl`/`en`/`de` + `x-default`=PL) i `canonical` per język; `app/sitemap.ts`
  rozszerzony o wpisy per język z hreflang; tytuły/opisy OG z komunikatów.

## Strony WWW obiektów (osobny mechanizm)

Inny host (rewrite w `proxy.ts`) + treść właściciela po polsku → **przełącznik +
cookie `SITE_LOCALE`, bez prefiksu w URL**. Renderer czyta locale z cookie i
lokalizuje **tylko statyczny chrome** (namespace `site`): nawigacja, stopka, widget
kalendarza (dni, przyciski), formularz kontaktowy, domyślne tytuły sekcji.
**Treść właściciela zostaje PL** w tej iteracji (pole locale już przepływa przez
renderer — gotowe pod przyszłe tłumaczenie treści). CTA „Zarezerwuj" przekazuje
wybrany język do flow gościa na hoście aplikacji (spójność strona obiektu ↔ rezerwacja).
Prefiks języka na stronach obiektów rozważymy dopiero po dodaniu tłumaczenia treści.

## E-maile/SMS do gościa

Zapisujemy `Reservation.locale` (`pl|en|de`) — język rezerwacji. Transakcyjne
wiadomości do gościa idą w jego języku (potwierdzenie, link do meldunku,
przypomnienie o przyjeździe, prośba o opinię, anulowanie, zmiana terminu) przez
`getTranslations(reservation.locale)` z namespace `email`/`sms` (dziś sztywne PL
w `lib/actions.ts`/`lib/jobs.ts` → zlokalizowane szablony). E-maile do właściciela
(powiadomienia, zapytania) zostają PL.

## Testy

- vitest: **kompletność kluczy** — `en.json`/`de.json` mają dokładnie te same
  klucze co `pl.json` (rekurencyjne porównanie zbiorów kluczy); ICU plural `nights`
  dla PL/DE.
- e2e (Playwright): przełącznik EN na stronie obiektu → etykiety EN, URL `/en`,
  `hreflang` w `<head>`; flow rezerwacji w EN; `Accept-Language: de` → wersja DE
  bez ręcznego wyboru; regresja: panel/superadmin dalej PL bez prefiksu.

## Poza MVP (kolejne etapy)

Tłumaczenie treści właściciela (opisy obiektu/pokoi, regulamin — AI/pola per język);
lokalizacja landing i panelu recepcji; przewalutowanie (ceny zostają PLN); języki
poza PL/EN/DE; prefiks języka na stronach obiektów po dodaniu tłumaczenia treści.

## Kryteria sukcesu

- Gość wchodzi z niemiecką przeglądarką → widzi flow rezerwacji po niemiecku
  bez ręcznego wyboru; potwierdzenie e-mail po niemiecku.
- Osobne, indeksowalne URL-e per język (`/en/o/slug`) z poprawnym `hreflang`.
- Panel recepcji i superadmin niezmienione (PL, bez prefiksu, testy zielone).
