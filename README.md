# Rezio — platforma rezerwacji dla wielu obiektów (MVP) 

Multi-tenant system rezerwacji noclegów bez prowizji: obiekty (pensjonaty, wille, apartamenty) rejestrują się samodzielnie, dostają własną stronę rezerwacji i panel recepcji. Inspirowany zestawieniem Profitroom / Hotres / IdoBooking.

> 📘 **Szczegółowa dokumentacja funkcji** — jak działa każdy moduł, trasy, pliki i dostępność per plan: [docs/FUNKCJE.md](docs/FUNKCJE.md). Żywy przewodnik design systemu: `/styleguide`.

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

Testy: `npm test` (Vitest, jednostkowe lib/) oraz `npm run test:e2e` (Playwright — pełny flow rezerwacji gościa z e-podpisem meldunku i panel recepcji; wymaga bazy z .env, dane testowe znakowane „E2E …”).

Konta:

| E-mail | Hasło | Rola |
|---|---|---|
| `demo@rezio.pl` | `demo1234` | konto demo (przycisk „Zobacz demo panelu" loguje na nie 1 klikiem) — Willa Rezio, plan Pro |
| `marina@rezio.pl` | `marina123` | właściciel — Apartamenty Marina Sopot, plan Standard |
| `admin@rezio.pl` | `admin1234` | **superadmin** → `/superadmin` (konta, obiekty, plany, MRR, GMV) |

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
- **Obiekt**: nazwa, opis, adres, godziny, % zaliczki, instrukcje przyjazdu (widoczne po meldunku); podgląd publicznego adresu.

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

## Konwencje

- Daty pobytu: stringi `YYYY-MM-DD`, przedziały półotwarte `[checkIn, checkOut)`, porównania leksykograficzne.
- Kwoty w groszach (int, sufiks `Gr`); formatowanie i odmiana nocy w `lib/format.ts`.
- Dostępność i przydział jednostki w transakcji (`lib/availability.ts`); PENDING po 30 min zwalnia termin.

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
4. **Cron** — harmonogram w `vercel.json`: `expire-reservations` o 8:00 UTC (wygaszanie PENDING + retencja kart meldunkowych + przypomnienia o przyjeździe; pora dobrana pod SMS-y do gości), `sync-ical` o 4:00. Endpointy `app/api/cron/*` chroni `CRON_SECRET`. Uwaga: plan **Hobby** ogranicza do 2 cronów 1×/dobę — do częstszego harmonogramu potrzebny plan Pro.
5. Deploy przez `git push` (integracja GitHub) lub `vercel --prod`. Build sam odpala `prisma generate` (`postinstall`).

## Wdrożenie na Docker (self-host)

```bash
# uploady wymagają BLOB_READ_WRITE_TOKEN (zdjęcia trafiają do Vercel Blob)
APP_URL=https://twojadomena.pl docker compose up -d --build
```

- Obraz buduje standalone Next (`output: "standalone"` poza Vercelem), przy starcie robi `prisma db push`.
- Wymaga zewnętrznego Postgresa (`DATABASE_URL`/`DIRECT_URL`) — SQLite nie jest już wspierany.
- Za reverse proxy (nginx/traefik) wystaw port 3000 + HTTPS.
- SEO: `app/sitemap.ts` i `app/robots.ts` generują sitemap.xml/robots.txt; landing ma JSON-LD (FAQPage, SoftwareApplication z ofertami planów, Organization).

## Poza MVP (faza 2)

Dwukierunkowy channel manager, prawdziwe płatności (BLIK), pakiety, housekeeping, wiele obiektów na konto, role zespołu, upselling (dopłaty za usługi), vouchery, KSeF (e-faktury), kiosk / zamki hotelowe / POS gastro (wymagają integracji sprzętowych).
