# Moduł „Strona WWW" — kreator stron obiektów z własną domeną

Data: 2026-07-23 · Status: zaakceptowany przez właściciela projektu

## Cel

Właściciel obiektu buduje z panelu RezOp własną stronę-wizytówkę (long-scroll, styl
apartamentyhiszpania.com.pl / apartamentywslupsku.pl / przystaneklesna.pl) bez wiedzy
technicznej, publikuje ją na subdomenie `*.rezop.pl`, a w planie PRO podpina własną
domenę z automatycznym SSL. Strona jest zasilana danymi już wprowadzonymi w RezOp
(obiekt, apartamenty, zdjęcia, cennik, opinie) — bez duplikacji danych.

## Decyzje kluczowe (ustalone z właścicielem)

1. **Hosting: Vercel**, ale warstwa domen za abstrakcją `DomainProvider` — furtka na
   migrację (Cloudflare for SaaS / własne proxy) bez ruszania reszty kodu.
2. **Zakres: pełne MVP z PRD** — kreator, subdomena, własna domena + SSL, SEO.
3. **Edytor: panel boczny + podgląd live w iframe.** Bez bibliotek page-builderowych,
   bez edycji inline, bez autosave. Kolejność sekcji strzałkami ↑↓. Celowo prosto.
4. **Edycja HTML:** (a) sekcja „Własny kod" (sanityzowany HTML), (b) podstawowy HTML
   w polach opisowych, (c) własny CSS w zakładce „Zaawansowane", (d) „Konwertuj na
   własny kod" — jednokierunkowe odpięcie sekcji generowanej (z ostrzeżeniem, że dane
   przestaną się aktualizować).
5. **Rezerwacja: hybryda** — widget kalendarza i ceny inline na stronie klienta,
   finalizacja (formularz + płatność) na istniejącym flow `rezop.pl/rezerwuj/…`.
6. **Gating planów:** FREE — zakładka z zachętą do upgrade'u; STANDARD — kreator +
   subdomena; PRO — dodatkowo własna domena. Jedna funkcja `sitePlanFeatures(plan)`.

## Architektura (podejście A — zaakceptowane)

Strona = rekord w bazie z konfiguracją JSON, renderowany na żywo przez komponenty
React w Next.js z cache ISR. Middleware/proxy mapuje hosta na obiekt. Odrzucono:
generowanie statycznego HTML przy publikacji (osobny pipeline, problem z widgetem
kalendarza) i zewnętrzny CMS (duplikacja danych, koszty).

### Model danych

Nowa tabela `Site` (1:1 z `Property`):

| Pole | Opis |
|---|---|
| `subdomain` | unikalna, generowana ze sluga, edytowalna (`przystanek-lesna` → `przystanek-lesna.rezop.pl`) |
| `customDomain` | opcjonalna, unikalna |
| `domainStatus` | `NONE / PENDING / VERIFIED / ERROR` |
| `template` | `gorski / nadmorski / miejski / uniwersalny` |
| `draftConfig` | JSON (string) — na nim pracuje edytor |
| `publishedConfig` | JSON (string), `null` = nieopublikowana — tylko to renderuje strona publiczna |
| `customCss` | własne style |
| `publishedAt` | data ostatniej publikacji |

Wersjonowanie w MVP: **Publikuj** = draft → published + revalidate cache;
**Cofnij do opublikowanej** = published → draft. Nic więcej.

### Konfiguracja JSON

```json
{
  "theme": { "palette": "warm", "font": "serif", "logoUrl": null, "heroPhotoId": 12 },
  "seo": { "title": "", "description": "" },
  "sections": [
    { "id": "abc1", "type": "hero", "enabled": true, "data": { "headline": "…", "ctaLabel": "…" } },
    { "id": "abc2", "type": "units", "enabled": true, "data": {} }
  ]
}
```

Sekcje danych (`units`, `gallery`, `calendar`, `reviews`) trzymają w `data` wyłącznie
ustawienia wyglądu — treść ciągną na żywo z tabel RezOp (brak duplikacji).

### Sekcje MVP

hero · o obiekcie · apartamenty (karty z danych + link rezerwacji) · galeria ·
udogodnienia (ikony lucide) · kalendarz dostępności + cennik (dane na żywo) ·
atrakcje okolicy (ręczna lista) · opinie (zebrane w RezOp) · kontakt + mapa
(OpenStreetMap embed, bez klucza API) · własny kod · stopka (automatyczna: kontakt,
linki do regulaminu i polityki prywatności z pól `Property`).

### Routing domen

- Middleware/proxy Next.js czyta `Host`: subdomena `*.rezop.pl` lub zweryfikowana
  domena własna → rewrite na `app/(www)/[host]/…` renderujące opublikowaną stronę.
- Domena bazowa działa jak dziś (panel, `o/[slug]` — bez zmian).
- Baza domeny w env `SITES_BASE_DOMAIN`; lokalnie `nazwa.localhost:3000` bez konfiguracji.
- `DomainProvider` (interfejs `add / status / remove`), implementacja MVP: Vercel API
  (dodanie domeny do projektu, odczyt statusu weryfikacji i SSL). Env: `VERCEL_TOKEN`,
  `VERCEL_PROJECT_ID`; brak = funkcja domen ukryta (wzorzec jak tryb symulacji P24).
- Apex + `www` dodawane razem, z przekierowaniem. Panel pokazuje rekordy DNS
  (A dla apeksu, CNAME dla `www`) i status: Oczekuje / Zweryfikowana / Błąd.

## Kreator w panelu (`app/admin/strona/`)

**Wizard przy pierwszym uruchomieniu:**
1. Wybór szablonu (4 kafle z miniaturami),
2. Potwierdzenie danych zaciąganych z RezOp (braki podświetlone z linkami do modułów),
3. Personalizacja: paleta (gotowe warianty per szablon, nie dowolny RGB), czcionka
   (2–3 pary), logo, zdjęcie hero,
4. Podgląd + akceptacja subdomeny + „Opublikuj".

Po wizardzie draft jest wypełniony danymi obiektu — nigdy pusta strona.

**Edytor:** lewa kolumna — lista sekcji (checkbox widoczności, ↑↓, klik rozwija
formularz pól, „+ Dodaj sekcję"); prawa — podgląd draftu w iframe (URL podglądu
wymaga sesji właściciela), przełącznik desktop/mobile = szerokość iframe. Pasek:
status zmian, **Opublikuj**, **Cofnij do opublikowanej**, link do strony na żywo.
Zapis jawnym przyciskiem przez server actions (wzorzec jak reszta panelu).

## SEO

- `generateMetadata`: tytuł/opis z konfiguracji, fallback z danych obiektu; Open Graph
  ze zdjęciem hero.
- JSON-LD `Schema.org/LodgingBusiness` z danych `Property`.
- `sitemap.xml` + `robots.txt` per host.
- Zdjęcia przez `next/image` (lazy, WebP/AVIF, responsywne).

## Bezpieczeństwo

- Sanityzacja allowlistą przy renderze pól HTML i sekcji „Własny kod" — bez `<script>`
  w MVP (XSS na współdzielonej platformie). Własny CSS dozwolony.
- Ciasteczko sesji panelu host-only (subdomeny stron go nie widzą).
- Podgląd draftu tylko dla właściciela; obiekt `suspended` = strona niedostępna.
- Nieznany host → 404/redirect na domenę bazową.

## Testy

- Vitest: walidacja JSON-a konfiguracji, sanitizer, `sitePlanFeatures`,
  akcje publikuj/cofnij.
- Playwright: wizard → publikacja → strona renderuje się z nagłówkiem `Host`
  subdomeny; gating planów.

## Poza MVP (kolejne etapy)

Wielojęzyczność (PL/EN/DE), generowanie treści AI, import opinii z OTA, newsletter,
automatyczne podpowiadanie atrakcji z danych mapowych, drag&drop układu, dodatkowe
szablony, historia wersji głębsza niż draft/published.

## Kryteria sukcesu (z PRD)

- Publikacja działającej strony < 30 min dla nowego użytkownika bez pomocy.
- Podpięcie własnej domeny bez supportu w > 80% przypadków.
- Rosnący odsetek rezerwacji z kanału własnego (poza OTA).

## Uwaga implementacyjna

Projekt używa Next.js 16 z breaking changes — przed pisaniem kodu przeczytać
odpowiednie przewodniki w `node_modules/next/dist/docs/` (middleware/proxy, ISR,
metadata, route groups). Patrz AGENTS.md.
