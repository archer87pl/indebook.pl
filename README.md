# Notelo — platforma rezerwacji dla wielu obiektów (MVP)

Multi-tenant system rezerwacji noclegów bez prowizji: obiekty (pensjonaty, wille, apartamenty) rejestrują się samodzielnie, dostają własną stronę rezerwacji i panel recepcji. Inspirowany zestawieniem Profitroom / Hotres / IdoBooking.

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

Konta:

| E-mail | Hasło | Rola |
|---|---|---|
| `demo@notelo.pl` | `demo1234` | konto demo (przycisk „Zobacz demo panelu" loguje na nie 1 klikiem) — Willa Notelo, plan Pro |
| `marina@notelo.pl` | `marina123` | właściciel — Apartamenty Marina Sopot, plan Standard |
| `admin@notelo.pl` | `admin1234` | **superadmin** → `/superadmin` (konta, obiekty, plany, MRR, GMV) |

Plany (`lib/plans.ts`): Start 0 zł (3 jednostki) / Standard 49 zł (15) / Pro 99 zł (bez limitu) — limit jednostek egzekwowany przy dodawaniu pokoi; plan zmienia superadmin.

## Architektura multi-tenant

- **Konta właścicieli**: rejestracja (`/rejestracja`) tworzy użytkownika + obiekt (User 1:1 Property); hasła scrypt (`lib/password.ts`), sesje w bazie z cookie httpOnly 30 dni (`lib/auth.ts`).
- **Strony obiektów**: `/o/[slug]` (slug generowany z nazwy, unikalny) + wyszukiwarka `/o/[slug]/wyniki`; katalog obiektów na stronie głównej.
- **Panel obiektu** (`/admin`): każda strona i akcja przechodzi przez `requireOwner()`, a wszystkie zapytania/mutacje są sprawdzane względem `propertyId` właściciela (helpery `ownedUnitType`/`ownedUnit`/`ownedReservation` w `lib/actions.ts`).

## Zakres MVP

**Gość**
- katalog obiektów, strona obiektu z wyszukiwarką terminów i cenami per noc,
- cennik sezonowy, min. długość pobytu, rezerwacja wstępna (30 min na zaliczkę),
- symulacja bramki płatności (do podmiany na Przelewy24 / Tpay w `payDeposit`),
- panel gościa `/r/[kod]`: status, zmiana terminu (requote + kontrola dostępności), anulowanie,
- wyszukiwanie rezerwacji `/moja-rezerwacja` (kod + e-mail), zgoda RODO.

**Właściciel (`/admin`)**
- onboarding po rejestracji („dodaj pierwszy typ pokoju"),
- pulpit (przyjazdy/wyjazdy/goście/oczekujące wpłaty), rezerwacje z filtrami, rezerwacje ręczne,
- kalendarz obłożenia + blokady, cennik z sezonami,
- **Pokoje**: CRUD typów pokoi i jednostek (z linkami iCal per jednostka),
- **Obiekt**: nazwa, opis, adres, godziny, % zaliczki; podgląd publicznego adresu.

**Channel manager (zakładka Kanały)**
- import iCal z Booking.com / Airbnb / Vrbo (presety z instrukcjami) + eksport iCal per jednostka z sekretnym tokenem w URL,
- automatyczna synchronizacja co godzinę (`instrumentation.ts`) + sync ręczny (wszystko / pojedynczy feed),
- wykrywanie **podwójnych rezerwacji** (kanał × rezerwacja bezpośrednia) z alertem na pulpicie,
- eksport nie zawiera terminów zaimportowanych z innych kanałów (ochrona przed pętlą),
- pełne API dwukierunkowe (ceny, real-time) — faza 2, wymaga certyfikacji partnerskiej.

**Pozostałe integracje**
- płatności Przelewy24 (env `P24_*`, fallback: symulacja), e-maile Resend (env `RESEND_API_KEY`, fallback: konsola).

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
3. **Zmienne środowiskowe** (Vercel → Settings → Environment Variables): `DATABASE_URL`, `DIRECT_URL`, `APP_URL` (adres produkcyjny), `CRON_SECRET` (dowolny losowy ciąg), oraz opcjonalnie `RESEND_API_KEY`, `EMAIL_FROM`, `P24_*`. Pełna lista w `.env.example`.
4. **Cron** — harmonogram w `vercel.json` (wygaszanie rezerwacji co 10 min, sync iCal co godzinę). Endpointy `app/api/cron/*` chroni `CRON_SECRET`. Uwaga: plan **Hobby** ogranicza cron do 1×/dobę — do częstszego harmonogramu potrzebny plan Pro.
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

Dwukierunkowy channel manager, prawdziwe płatności (BLIK), wysyłka e-maili, kody promo / pakiety, dynamic pricing, self check-in, housekeeping, faktury, wiele obiektów na konto, role zespołu, weryfikacja e-mail / reset hasła.
