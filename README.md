# RezFlow — platforma rezerwacji dla wielu obiektów (MVP) 

Multi-tenant system rezerwacji noclegów bez prowizji: obiekty (pensjonaty, wille, apartamenty) rejestrują się samodzielnie, dostają własną stronę rezerwacji i panel recepcji. Inspirowany zestawieniem Profitroom / Hotres / IdoBooking.

> 📘 **Szczegółowa dokumentacja funkcji** — jak działa każdy moduł, trasy, pliki i dostępność per plan: [docs/FUNKCJE.md](docs/FUNKCJE.md). Żywy przewodnik design systemu: `/styleguide`.

## Układ repozytorium

Monorepo: aplikacja w korzeniu, silnik cen jako osobny serwis.

```
/                      RezFlow — Next.js, panel recepcji i ścieżka gościa
services/smartrate/    SmartRate — silnik cen dynamicznych (.NET) + scraper
contracts/             granica HTTP między nimi (patrz niżej)
```

**Systemy rozmawiają po HTTP, mimo wspólnego repozytorium.** SmartRate stoi
w kontenerze i ma swój cykl wydawniczy — RezFlow woła go przez
`lib/rates/smartrate.ts`, nigdy bezpośrednio.

Granicę pilnuje `contracts/smartrate-quote.json`: to jedno źródło prawdy dla
kształtu odpowiedzi `POST /v1/quote`, weryfikowane testami **po obu stronach**
(`lib/rates/smartrate.test.ts` i `QuoteContractTests.cs`). Zmiana pola w C#
zapala się od razu, zamiast psuć mapowanie w TypeScripcie na produkcji.

## Stack

- Next.js 16 (App Router, Server Actions, Turbopack) + React 19 + TypeScript
- Tailwind CSS 4 (paleta marki i klasy komponentów w `app/globals.css`)
- Prisma 6 + PostgreSQL (Supabase); zdjęcia w Vercel Blob

## Uruchomienie

```bash
npm install
# ustaw DATABASE_URL/DIRECT_URL w .env (Postgres/Supabase — patrz .env.example)
npm run db:push   # tworzy tabele wg prisma/schema.prisma
npm run db:seed   # dwa demo obiekty (dane logowania poniżej)
npm run dev
```

Testy: `npm test` (Vitest — logika w `lib/`, trasy `app/api/`, `proxy.ts` oraz komponenty klienckie z logiką; te ostatnie w jsdom, przez `// @vitest-environment jsdom` w nagłówku pliku). `npm run test:coverage` daje raport pokrycia oraz `npm run test:e2e` (Playwright, 50 testów — rezerwacja gościa z e-podpisem meldunku, panel recepcji, rejestracja i reset hasła, kanały i iCal, wielojęzyczność, strony WWW obiektów oraz akcje panelu platformy; wymaga bazy z .env, dane testowe znakowane „E2E …”).

Konta:

| E-mail | Hasło | Rola |
|---|---|---|
| `demo@rezflow.pl` | `demo1234` | konto demo (przycisk „Zobacz demo panelu" loguje na nie 1 klikiem) — Willa RezFlow, plan Pro |
| `marina@rezflow.pl` | `marina123` | właściciel — Apartamenty Marina Sopot, plan Standard |
| `admin@rezflow.pl` | `admin1234` | **superadmin** → `/superadmin` (konta, obiekty, plany, MRR, GMV) |

Plany (`lib/plans.ts`): Start 0 zł (3 jednostki) / Standard 79 zł (15) / Pro 149 zł (bez limitu) — limit jednostek egzekwowany przy dodawaniu pokoi; plan zmienia superadmin.

## Architektura multi-tenant

- **Konta właścicieli**: rejestracja (`/rejestracja`) tworzy użytkownika + obiekt (User 1:1 Property); hasła scrypt (`lib/password.ts`), sesje w bazie z cookie httpOnly 30 dni (`lib/auth.ts`).
- **Strony obiektów**: `/o/[slug]` (slug generowany z nazwy, unikalny) + wyszukiwarka `/o/[slug]/wyniki`; katalog obiektów na stronie głównej.
- **Panel obiektu** (`/admin`): każda strona i akcja przechodzi przez `requireOwner()`, a wszystkie zapytania/mutacje są sprawdzane względem `propertyId` właściciela (helpery `ownedUnitType`/`ownedUnit`/`ownedReservation` w `lib/actions.ts`).

## Zakres MVP

**Gość**
- katalog obiektów, strona obiektu z wyszukiwarką terminów i cenami per noc,
- cennik sezonowy, min. długość pobytu, rezerwacja wstępna (30 min na zaliczkę),
- płatności Przelewy24 per obiekt (własne konto P24 właściciela w `/admin/platnosci/konfiguracja`; bez danych — symulacja),
- panel gościa `/r/[kod]`: status, zmiana terminu (requote + kontrola dostępności), anulowanie,
- **meldunek online** `/r/[kod]/meldunek`: karta meldunkowa z e-podpisem (canvas), dane dokumentu bez skanów (RODO), dodatkowi goście, nr auta; po wypełnieniu gość widzi instrukcje przyjazdu (kody, WiFi) i jego e-mail uznajemy za potwierdzony,
- **czat z obiektem** na stronie rezerwacji — obie strony dostają powiadomienia e-mail, nieprzeczytane oznaczane przy wejściu,
- **SMS-y** (gdy gość podał telefon): potwierdzenie rezerwacji z linkiem do meldunku + przypomnienie dzień przed przyjazdem,
- **opinie po pobycie** `/r/[kod]/opinia`: ocena 1–5 gwiazdek + komentarz (prośba e-mail/SMS dzień po wymeldowaniu, cron); publikacja na stronie obiektu pod imieniem i inicjałem,
- wyszukiwanie rezerwacji `/moja-rezerwacja` (kod + e-mail), zgoda RODO.
- **wielojęzyczny interfejs (PL / EN / DE)**: prefiks w URL (`/en/o/...`, polski bez prefiksu), auto-detekcja z `Accept-Language`, przełącznik w nagłówku, hreflang; maile i SMS-y lecą w języku, w którym gość rezerwował. Tłumaczymy interfejs — treści właściciela zostają w oryginale. Panel recepcji po polsku.
- **ceny dynamiczne (Pro)**: przełącznik silnika wyceny — podstawowe reguły RezFlow albo zewnętrzne API SmartRate (rekomendacja per doba z rozbiciem na sezon, dzień tygodnia, wyprzedzenie, obłożenie rynku i popyt); ceny czytane z cache w bazie, odświeżane w tle, awaria API cicho degraduje do reguł.

**Blog / poradnik (`/blog`)**
- artykuły jako pliki Markdown w `content/blog/*.md` (frontmatter: tytuł, data, zajawka, tag, okładka, `draft`), generowane statycznie; treść przez `marked`, JSON-LD `BlogPosting`, sekcja najnowszych na landingu i wpisy w `sitemap.xml`. Instrukcja dla autorów: `content/blog/README.md`.

**Właściciel (`/admin`)**
- onboarding po rejestracji („dodaj pierwszy typ pokoju"),
- pulpit 1c (KPI z przychodem i trendem m/m, plan dnia, obłożenie 14 dni, feed aktywności + alerty nieprzeczytanych wiadomości i konfliktów kanałów), rezerwacje z zakładkami statusów, wyszukiwarką i szczegółami ze stepperem, rezerwacje ręczne,
- **Goście (CRM)**: baza budowana z rezerwacji (pobyty, wydatki, tagi VIP/Powracający/Nowy) i **Płatności**: rejestr zaliczek online, potwierdzeń ręcznych i oczekujących wpłat,
- **czat z gościem** przy rezerwacji (badge nieprzeczytanych na liście i pulpicie),
- **opinie gości** (zakładka Opinie): moderacja (ukryj/przywróć), publiczna odpowiedź obiektu; średnia i `aggregateRating` (JSON-LD) na stronie obiektu,
- kalendarz obłożenia + blokady, cennik z sezonami,
- **ceny dynamiczne** (`lib/dynamic-pricing.ts`): reguły weekend / last minute / wysokie obłożenie per obiekt — korekty % za noc nakładane na cennik, spójnie we wszystkich wycenach (wyszukiwarka, rezerwacja, zmiana terminu),
- **Meldunek online**: status na listach (badge „✓ meldunek"), podgląd/druk karty meldunkowej z podpisem, ręczna wysyłka linku do meldunku; karty (PII) kasowane automatycznie 12 mies. po wymeldowaniu (cron),
- **Faktury** (zakładka Faktury): wystawianie z rezerwacji (VAT / zaliczkowa / proforma), numeracja kolejna per seria i rok (FV/FZ/PRO), rozbicie brutto→netto+VAT (8/23/5/0%), snapshot sprzedawcy i nabywcy, widok do druku/PDF (`window.print()`), rejestr z sumą; dane sprzedawcy (NIP, konto) w ustawieniach obiektu,
- **Pokoje**: CRUD typów pokoi i jednostek (z linkami iCal per jednostka),
- **Obiekt**: nazwa, opis, adres, godziny, % zaliczki, instrukcje przyjazdu (widoczne po meldunku); podgląd publicznego adresu,
- **Strona WWW** (`/admin/strona`, Standard+): kreator strony-wizytówki obiektu — 4 szablony, wizard startowy wypełniany danymi z RezFlow, edytor sekcji z podglądem draft/publikacja, publikacja na subdomenie `nazwa.rezflow.pl` (env `SITES_BASE_DOMAIN`), własna domena z automatycznym SSL w planie Pro (Vercel API za abstrakcją `DomainProvider`), SEO (JSON-LD, sitemap/robots per host), widget kalendarza z cenami na żywo i formularz zapytań; szczegóły w `docs/FUNKCJE.md` §12.

**Superadmin (`/superadmin`)**
- pulpit platformy: konta, obiekty, MRR wg planów, rezerwacje i GMV (30 dni / od początku), rozkład planów, **trend wzrostu 6 miesięcy** (GMV/rezerwacje/nowe obiekty), **zdrowie platformy** (feedy iCal z błędami, zawieszone, oczekujące płatności), wyszukiwarka obiektów,
- **globalne widoki**: rezerwacje całej platformy (`/superadmin/rezerwacje` — statusy, wyszukiwarka, filtr per obiekt) i moderacja opinii ponad obiektami (`/superadmin/opinie`),
- **impersonacja**: „Zaloguj jako właściciel" — wejście do panelu recepcji obiektu w celach wsparcia (sesja admina zastępowana),
- **konfiguracja integracji z panelu** (`/superadmin/ustawienia`): Resend / SMSAPI zapisywane w bazie (`PlatformSetting`) z pierwszeństwem nad ENV, sekrety maskowane, test wysyłki e-mail (płatności P24 konfiguruje każdy obiekt u siebie),
- **dziennik zdarzeń** (`/superadmin/logi`): rezerwacje, płatności, e-maile/SMS-y, błędy iCal, nieudane logowania i akcje admina — filtry, paginacja, retencja 90 dni,
- **karta obiektu** `/superadmin/obiekt/[id]`: edycja danych obiektu (nazwa, slug ze sprawdzeniem unikalności, plan bez limitu jednostek, % zaliczki, godziny, adres, opis) i konta właściciela (imię, e-mail), wysyłka linku do resetu hasła, statystyki (jednostki, rezerwacje, GMV, opinie),
- **zawieszenie obiektu** (ukrycie z katalogu + blokada nowych rezerwacji, egzekwowane też w `createReservation`) i **trwałe usunięcie** obiektu wraz z kontem i całą historią (potwierdzenie slugiem, kaskada w transakcji).

**Channel manager (zakładka Kanały)**
- import iCal z Booking.com / Airbnb / Vrbo (presety z instrukcjami) + eksport iCal per jednostka z sekretnym tokenem w URL,
- automatyczna synchronizacja co godzinę (`instrumentation.ts`) + sync ręczny (wszystko / pojedynczy feed),
- wykrywanie **podwójnych rezerwacji** (kanał × rezerwacja bezpośrednia) z alertem na pulpicie,
- eksport nie zawiera terminów zaimportowanych z innych kanałów (ochrona przed pętlą),
- pełne API dwukierunkowe (ceny, real-time) — faza 2, wymaga certyfikacji partnerskiej.

**Pozostałe integracje**
- płatności Przelewy24 per obiekt (pola `Property.p24*` z panelu obiektu, fallback: symulacja), e-maile Resend (env `RESEND_API_KEY`, fallback: konsola), SMS-y SMSAPI (env `SMSAPI_TOKEN`, fallback: konsola) — potwierdzenie rezerwacji i przypomnienie dzień przed przyjazdem (z linkiem do meldunku, cron, wysyłka tylko 8–21).

## CI

`.github/workflows/ci.yml` odpala się na PR-ach i push-ach do `main` w dwóch jobach:

- **check** — `tsc`, `eslint`, testy jednostkowe i `npm run build`; bez bazy, bo
  testy jednostkowe jej nie potrzebują (te, które potrzebują, same się pomijają
  bez `TEST_DATABASE_URL`).
- **e2e** — Playwright na realnej aplikacji z Postgresem w usłudze i danymi
  z `npm run db:seed`; ceny dynamiczne na stubie (`SMARTRATE_STUB=1`), żeby nic
  nie wychodziło do sieci. Przy porażce wrzuca `test-results/` jako artefakt.
  **Nie odpala się na pushu ani na PR** — to najdroższy job w tym repo, a logikę
  pokrywają testy jednostkowe. Uruchomienie na żądanie: Actions → *ci* → *Run
  workflow*; lokalnie `npm run test:e2e`.

Wersja npm jest przypięta do tej z `package.json#packageManager` — starszy npm
inaczej rozwiązuje peery optional deps i `npm ci` się wywala.

## Konwencje

- Daty pobytu: stringi `YYYY-MM-DD`, przedziały półotwarte `[checkIn, checkOut)`, porównania leksykograficzne.
- Kwoty w groszach (int, sufiks `Gr`); formatowanie i odmiana nocy w `lib/format.ts`.
- Dostępność i przydział jednostki w transakcji (`lib/availability.ts`); PENDING po 30 min zwalnia termin.
- Teksty interfejsu gościa: `messages/<pl|en|de>/<namespace>.json` (polski źródłem prawdy, test parzystości kluczy w `i18n/messages.test.ts`). W trasach gościa linkuj przez `Link` z `@/i18n/navigation`, a `href` dla `components/ui/Button` buduj `localePath()` z `lib/locale-urls.ts`.
- Ceny dynamiczne: `quoteStayDynamic` jest jedynym wejściem do wyceny; SmartRate wchodzi przez cache `DynamicRate` (nigdy HTTP w ścieżce gościa), a niepełne pokrycie degraduje CAŁĄ wycenę do reguł.

## Wdrożenie na Vercel (zalecane)

Baza: **Supabase Postgres**, storage zdjęć: **Vercel Blob**, zadania w tle: **Vercel Cron**.

1. **Baza (Supabase)** — utwórz projekt, skopiuj z Project Settings → Database:
   - `DATABASE_URL` = connection string „Transaction" (pooler, port 6543) + `?pgbouncer=true&connection_limit=1`,
   - `DIRECT_URL` = połączenie bezpośrednie (port 5432).
   Zainicjalizuj schemat i dane:
   ```bash
   npx prisma db push   # tworzy tabele wg schema.prisma (używa DIRECT_URL)
   npm run db:seed      # opcjonalnie: demo obiekty i superadmin
   ```
2. **Blob** — w dashboardzie Vercel: Storage → Create → Blob; token `BLOB_READ_WRITE_TOKEN` wstrzyknie się automatycznie do deploymentu (`vercel env pull` do dev).
3. **Zmienne środowiskowe** (Vercel → Settings → Environment Variables): `DATABASE_URL`, `DIRECT_URL`, `APP_URL` (adres produkcyjny), `CRON_SECRET` (dowolny losowy ciąg), oraz opcjonalnie `RESEND_API_KEY`, `EMAIL_FROM`. Pełna lista w `.env.example`.
4. **Strony WWW obiektów** (opcjonalnie): dodaj do projektu domenę wildcard `*.rezflow.pl` (subdomeny stron) i ustaw `SITES_BASE_DOMAIN`; dla podpinania własnych domen klientów ustaw `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (+ `VERCEL_TEAM_ID` w teamie) — bez nich sekcja domen jest ukryta.
4. **Cron** — harmonogram w `vercel.json`: `expire-reservations` o 8:00 UTC (wygaszanie PENDING + retencja kart meldunkowych + przypomnienia o przyjeździe; pora dobrana pod SMS-y do gości), `sync-ical` o 4:00. Endpointy `app/api/cron/*` chroni `CRON_SECRET`. Uwaga: plan **Hobby** ogranicza do 2 cronów 1×/dobę — do częstszego harmonogramu potrzebny plan Pro.
5. Deploy przez `git push` (integracja GitHub) lub `vercel --prod`. Build sam odpala `prisma generate` (`postinstall`).

## Wdrożenie na Docker (self-host)

Dwa warianty. **Sama aplikacja** (RezFlow + własny Postgres; ceny dynamiczne chodzą wtedy na deterministycznym stubie):

```bash
APP_URL=https://twojadomena.pl docker compose up -d --build
```

**Cały system** — aplikacja razem z silnikiem cen SmartRate z sąsiedniego repo `Rezio.SmartRate`:

```bash
docker compose -f docker-compose.full.yml up -d --build
```

Podnosi 8 usług w jednym projekcie Compose (wspólna sieć, więc widzą się po nazwach):

| Usługa | Adres | Rola |
|---|---|---|
| `rezflow` | http://localhost:3000 | aplikacja |
| `rezflow-db` | localhost:5433 | Postgres aplikacji |
| `rezio-api` | http://localhost:8080 | silnik cen SmartRate + jego panel |
| `scraper-api` | http://localhost:8082 | scraper rynków |
| `postgres` | localhost:5432 | Postgres SmartRate |
| `grafana` | http://localhost:3001 | logi (datasource Loki) |
| `loki` | http://localhost:3101 | zbieranie logów |
| `healthchecks-ui` | http://localhost:8090 | zdrowie usług .NET |

Dane startowe (konta demo i dwa obiekty) wgrasz z hosta przez wystawiony port bazy:

```bash
DATABASE_URL=postgresql://rezflow:rezflow@localhost:5433/rezflow DIRECT_URL=postgresql://rezflow:rezflow@localhost:5433/rezflow npm run db:seed
```

- Obraz buduje standalone Next (`output: "standalone"` poza Vercelem), przy starcie robi `prisma db push`.
- Zadania okresowe poza Vercelem odpala `instrumentation.ts` (długożyjący proces) — nie `vercel.json`.
- Konfiguracja przez zmienne środowiskowe (patrz `.env.example`); wszystkie mają sensowne domyślne, więc `up` działa bez żadnego pliku `.env`.
- Zdjęcia: z `BLOB_READ_WRITE_TOKEN` lecą do Vercel Blob, bez niego na dysk (wolumen `rezflow-uploads`, katalog z `UPLOADS_DIR`). Pliki serwuje trasa `/uploads/*`, bo Next w trybie standalone nie oddaje plików dopisanych do `public` po zbudowaniu obrazu.
- Porty SmartRate są w `docker-compose.full.yml` przemapowane (Grafana 3000→3001, Loki 3100→3101), bo domyślne zderzają się z aplikacją i z testami e2e.
- `SMARTRATE_API_KEY` ustawione po obu stronach włącza autoryzację silnika cen. Puste = endpointy SmartRate otwarte, co jest dopuszczalne tylko dlatego, że nie wychodzą poza sieć Compose.
- Repo SmartRate w innej lokalizacji wskażesz zmienną `SMARTRATE_REPO`.
- Za reverse proxy (nginx/traefik) wystaw port 3000 + HTTPS.
- SEO: `app/sitemap.ts` i `app/robots.ts` generują sitemap.xml/robots.txt; landing ma JSON-LD (FAQPage, SoftwareApplication z ofertami planów, Organization).

## Poza MVP (faza 2)

Dwukierunkowy channel manager, prawdziwe płatności (BLIK), pakiety, housekeeping, wiele obiektów na konto, role zespołu, upselling (dopłaty za usługi), vouchery, KSeF (e-faktury), kiosk / zamki hotelowe / POS gastro (wymagają integracji sprzętowych).
