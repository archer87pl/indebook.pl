# Rezio — dokumentacja funkcji

Szczegółowy opis wszystkich funkcji platformy: co robią, jak działają pod spodem,
gdzie mieszkają w kodzie i w którym planie są dostępne.

Rezio to **multi-tenant system rezerwacji bez prowizji** dla małych obiektów
noclegowych (wille, pensjonaty, apartamenty, domki). Obiekt płaci stały abonament,
a wszystkie rezerwacje z własnej strony są w 100% jego — zamiast oddawania 15–25%
portalom OTA. Każdy obiekt dostaje publiczną stronę rezerwacji, panel recepcji
i komplet automatyzacji (płatności, meldunek, SMS-y, opinie, faktury).

> Konwencje kodu: daty pobytu to stringi `YYYY-MM-DD` (przedziały półotwarte
> `[checkIn, checkOut)`), kwoty w groszach (`...Gr`), pula połączeń Prisma ma
> limit 1 — wiele zapytań łączy się w `prisma.$transaction([...])`.

---

## Spis treści

1. [Plany i limity](#1-plany-i-limity)
2. [Ścieżka gościa](#2-ścieżka-gościa)
3. [Panel recepcji](#3-panel-recepcji)
4. [Channel manager](#4-channel-manager)
5. [Superadmin](#5-superadmin)
6. [Automatyzacje (cron)](#6-automatyzacje-cron)
7. [Powiadomienia](#7-powiadomienia-e-mail--sms)
8. [Design system „1c Zieleń wiodąca”](#8-design-system-1c-zieleń-wiodąca)
9. [Bezpieczeństwo i RODO](#9-bezpieczeństwo-i-rodo)
10. [Testy](#10-testy)
11. [Mapa tras](#11-mapa-tras)
12. [Strona WWW obiektu (kreator)](#12-strona-www-obiektu-kreator)

---

## 1. Plany i limity

Definicje w `lib/plans.ts`; limit jednostek egzekwowany przy dodawaniu pokoi,
plan zmienia superadmin (zmiana przez administratora pomija limit).

| | **Start** — 0 zł/mc | **Standard** — 79 zł/mc | **Pro** — 149 zł/mc |
|---|---|---|---|
| Jednostki | do 3 | do 15 | bez limitu |
| Strona obiektu + rezerwacja online | ✓ | ✓ | ✓ |
| Kalendarz, rezerwacje ręczne, panel gościa, opinie, e-maile | ✓ | ✓ | ✓ |
| Channel manager iCal, płatności online, meldunek online, czat, SMS-y, kody promo | — | ✓ | ✓ |
| Ceny dynamiczne, faktury VAT, raporty per kanał, eksport CSV | — | — | ✓ |

Żaden plan nie pobiera prowizji od rezerwacji.

---

## 2. Ścieżka gościa

### 2.1 Katalog i landing (`/`)

Strona główna łączy landing produktu (hero z podglądem panelu, funkcje, cennik
planów z pełną macierzą, porównanie z OTA, **sekcja najnowszych artykułów
z bloga**, FAQ) z **katalogiem obiektów** — każdy niezawieszony obiekt z co
najmniej jednym typem pokoju dostaje kartę z okładką, opisem i ceną „od”. SEO:
JSON-LD (FAQPage, SoftwareApplication z ofertami planów, Organization), sitemap
i robots generowane dynamicznie.

*Pliki:* `app/(site)/page.tsx`, `app/sitemap.ts`, `app/robots.ts`

### 2.2 Blog / poradnik (`/blog`)

Blog marketingowy oparty na **plikach Markdown** w `content/blog/*.md` — jeden
plik = jeden artykuł, nazwa pliku = slug (`/blog/slug`). Każdy plik ma nagłówek
(frontmatter: `title`, `date`, `excerpt`, opcjonalnie `tag`, `author`, `cover`,
`draft`) i treść w Markdown (nagłówki, listy, tabele, cytaty, kod, linki).

- **Strony generowane statycznie** przy `next build` (`generateStaticParams`) —
  najlepsza wydajność i SEO; dodanie artykułu = commit pliku `.md` + wdrożenie,
  bez zmian w kodzie,
- indeks `/blog` z wyróżnionym najnowszym wpisem i siatką pozostałych (tag,
  data, czas czytania liczony z długości tekstu),
- artykuł `/blog/[slug]`: treść w stylu `.prose` (renderowana przez `marked`),
  metadane Open Graph, **JSON-LD `BlogPosting`**, blok CTA („Zarejestruj obiekt”)
  i „Czytaj dalej”,
- `draft: true` ukrywa wpis na produkcji; artykuły trafiają do `sitemap.xml`,
  a najnowsze trzy — do sekcji na landingu,
- instrukcja dla autorów: `content/blog/README.md`.

*Pliki:* `lib/blog.ts` (parser frontmatteru + `marked`), `content/blog/*.md`,
`app/(site)/blog/**`, style `.prose` w `app/globals.css`

### 2.2 Strona obiektu (`/o/[slug]`)

Publiczna wizytówka: galeria zdjęć (siatka 2:1:1 z licznikiem „+N zdjęć”),
nazwa + adres + średnia ocen + badge „0% prowizji”, opis, lista typów pokoi
(zdjęcie, pojemność, udogodnienia jako pigułki, cena bazowa za noc), opinie
gości z odpowiedziami obiektu, FAQ obiektu (edytowalne w panelu) oraz **sticky
widget dostępności** (daty + goście → wyniki). JSON-LD `LodgingBusiness`
z `aggregateRating` — gwiazdki trafiają do wyników Google.

Podstrony: `/pokoj/[unitTypeId]` (karta pokoju z cennikiem sezonowym),
`/regulamin` (regulamin + polityka prywatności), `/wyniki` (dostępność).

*Pliki:* `app/(site)/o/[slug]/**`, `lib/amenities.ts`, `lib/reviews.ts`

### 2.3 Wyszukiwarka dostępności (`/o/[slug]/wyniki`)

Dla zadanego zakresu dat i liczby gości pokazuje wyłącznie typy pokoi
z **wolną jednostką w całym zakresie** (kolizje sprawdzane z rezerwacjami
CONFIRMED, aktywnymi PENDING i blokadami — w tym iCal). Każda oferta ma
policzoną cenę łączną (cennik sezonowy + ceny dynamiczne), liczbę wolnych
jednostek i respektuje minimalną długość pobytu (za krótki pobyt = badge
„min. pobyt: X” zamiast CTA).

*Pliki:* `app/(site)/o/[slug]/wyniki/page.tsx`, `lib/availability.ts`

### 2.4 Wycena: cennik sezonowy, ceny dynamiczne, kody promo

Cena nocy liczona jest per doba, spójnie we **wszystkich** miejscach
(wyszukiwarka, formularz rezerwacji, zmiana terminu, rezerwacja ręczna):

1. **Baza**: cena bazowa typu pokoju albo cena sezonu (`RateSeason` —
   zakresy dat z własną ceną i min. pobytem).
2. **Ceny dynamiczne** (plan Pro, `lib/dynamic-pricing.ts`) — maks. jedna
   reguła każdego rodzaju na obiekt, korekty % sumują się per noc:
   - **Weekend** — koryguje noce piątkowe i sobotnie (domyślnie +15%),
   - **Last minute** — noce w najbliższych N dniach (domyślnie ≤7 dni, −10%),
   - **Wysokie obłożenie** — noce, w których obłożenie danego typu pokoju
     (rezerwacje + blokady) osiąga próg (domyślnie ≥80%, +10%).
3. **Kod promocyjny** (`PromoCode`) — rabat % od kwoty pobytu, z zakresem
   ważności, limitem użyć i licznikiem; walidowany serwerowo przy rezerwacji.

Zaliczka = skonfigurowany % obiektu (domyślnie 30%) od kwoty po rabacie.

*Pliki:* `lib/pricing.ts`, `lib/dynamic-pricing.ts`, panel: `app/admin/cennik/page.tsx`

### 2.5 Rezerwacja i płatność zaliczki (`/rezerwuj/[unitTypeId]`)

Formularz danych gościa (imię i nazwisko, e-mail, telefon, NIP do faktury,
kod promo, uwagi, zgoda RODO + akceptacja regulaminu) z podsumowaniem pobytu
(rozbicie per noc w rozwijanym szczególe, „Zaliczka teraz / reszta przy
przyjeździe”). Po wysłaniu:

- system **w transakcji** sprawdza dostępność i przydziela konkretną jednostkę,
- powstaje rezerwacja **PENDING z 30-minutową blokadą** (`expiresAt`) — po tym
  czasie termin zwalnia się automatycznie (cron + filtry w zapytaniach),
- gość dostaje e-mail i trafia do panelu gościa, gdzie opłaca zaliczkę:
  **Przelewy24** (BLIK/karta/przelew; konto P24 obiektu z
  `/admin/platnosci/konfiguracja`, webhook `api/payments/p24`)
  albo — bez konfiguracji — **symulacja** potwierdzająca od razu (dev/demo),
- wpłata → status **CONFIRMED**, e-mail + SMS z linkiem do meldunku online.

*Pliki:* `app/(site)/rezerwuj/[unitTypeId]/page.tsx`, `lib/actions.ts`
(`createReservation`, `payDeposit`), `lib/payments.ts`, `lib/availability.ts`

### 2.6 Panel gościa (`/r/[kod]`)

Samoobsługa bez logowania — link z kodem rezerwacji (`HO-XXXX`) wysyłany
e-mailem/SMS-em:

- **bilet rezerwacji**: kod, status, obiekt/jednostka, terminy z godzinami
  doby hotelowej, goście, kwota i zaliczka,
- **opłacenie zaliczki** (dla PENDING) z licznikiem ważności blokady,
- **zmiana terminu**: nowe daty/liczba gości → requote wg cennika dla nowego
  terminu + kontrola dostępności (może przydzielić inną jednostkę tego samego
  typu); wpłacona zaliczka zaliczana na poczet pobytu; e-mail z potwierdzeniem,
- **anulowanie** rezerwacji (e-mail z potwierdzeniem),
- **czat z obiektem** (patrz 2.8), kontakt do gospodarza i adres z mapą,
- po meldunku — **instrukcje przyjazdu** (kody do drzwi, WiFi, dojazd),
- po pobycie — zaproszenie do wystawienia opinii.

Wyszukanie zgubionej rezerwacji: `/moja-rezerwacja` (kod + e-mail).

*Pliki:* `app/(site)/r/[code]/page.tsx`, `app/(site)/moja-rezerwacja/page.tsx`

### 2.7 Meldunek online z e-podpisem (`/r/[kod]/meldunek`)

Dostępny dla rezerwacji CONFIRMED przed wymeldowaniem (`canCheckIn`,
`lib/checkin.ts`). Karta meldunkowa zbiera: dane gościa głównego (adres,
obywatelstwo, opcjonalnie rodzaj+numer dokumentu — **bez skanów**, zgodnie
z RODO), planowaną godzinę przyjazdu, nr rejestracyjny auta, dodatkowych gości
(imię + data urodzenia, do opłaty miejscowej) oraz **odręczny e-podpis**
(canvas — palec/mysz/rysik, zapis jako PNG data-URL; pusty podpis nie
przechodzi walidacji serwera).

Po wypełnieniu: gość od razu widzi instrukcje przyjazdu, jego e-mail jest
uznany za potwierdzony (`emailVerifiedAt` — link szedł na ten adres),
właściciel dostaje powiadomienie, a na listach panelu pojawia się badge
„meldunek ✓”. Dane karty (PII) są **automatycznie kasowane 12 miesięcy po
wymeldowaniu** (cron); sam status meldunku zostaje.

*Pliki:* `app/(site)/r/[code]/meldunek/page.tsx`, `components/SignaturePad.tsx`,
`lib/checkin.ts`, podgląd/druk: `app/admin/rezerwacje/[id]/karta/page.tsx`

### 2.8 Czat gość ↔ obiekt

Wątek wiadomości przypięty do rezerwacji, dostępny z obu stron (panel gościa
i szczegóły rezerwacji w panelu recepcji). Obie strony dostają powiadomienia
e-mail o nowej wiadomości; wejście na stronę oznacza wiadomości drugiej strony
jako przeczytane. Nieprzeczytane wiadomości gości podbijają badge na liście
rezerwacji i alert na pulpicie recepcji.

*Pliki:* `components/ChatThread.tsx`, `lib/actions.ts`
(`sendGuestMessage`, `sendOwnerMessage`), model `Message`

### 2.9 Opinie po pobycie (`/r/[kod]/opinia`)

Dzień po wymeldowaniu cron wysyła e-mail + SMS z prośbą o opinię (raz na
rezerwację). Opinia = ocena 1–5 gwiazdek + komentarz (do 1000 znaków) + zgoda
na publikację; publikowana na stronie obiektu pod imieniem i inicjałem
nazwiska (np. „Anna K.”). Jedna opinia na rezerwację, tylko po zakończonym
pobycie (`canReview`). Obiekt może publicznie odpowiedzieć i moderować
(ukryj/przywróć — bez kasowania). Średnia zasila `aggregateRating` w JSON-LD.

*Pliki:* `app/(site)/r/[code]/opinia/page.tsx`, `components/StarRating.tsx`,
`lib/reviews.ts`, panel: `app/admin/opinie/page.tsx`

---

## 3. Panel recepcji

Dostęp: `/admin`, po zalogowaniu (`/login`; przycisk „Zobacz demo panelu”
loguje na konto demo jednym klikiem). Każda strona i akcja przechodzi przez
`requireOwner()`, a zapytania są izolowane per `propertyId` właściciela.
Shell panelu: ciemnozielony rail nawigacji (216 px) z kartą obiektu i planem,
topbar z tytułem strony, globalną wyszukiwarką rezerwacji i CTA „Nowa
rezerwacja”; na mobile rail zamienia się w poziomy pasek ikon.

### 3.1 Pulpit (`/admin`)

Centrum dowodzenia dnia:

- **KPI**: przychód bieżącego miesiąca (ciemna karta hero z trendem m/m
  i dopiskiem „0 zł prowizji”), przyjazdy dziś / wyjazdy, obłożenie na
  najbliższe 14 dni (pasek postępu), ADR i RevPAR,
- **Plan dnia**: oś wyjazdów (do godziny wymeldowania) i przyjazdów (od
  godziny zameldowania) z inicjałami gościa, jednostką, kanałem i statusem
  (opłacona / oczekuje / meldunek ✓); wiersz klika się do szczegółów,
- **Obłożenie 14 dni**: słupki per doba z podziałem bezpośrednie / oczekujące
  / kanały OTA, weekendy wyróżnione, dziś obrysowane,
- **Aktywność**: feed ostatnich zdarzeń (nowe rezerwacje, opinie, sync iCal),
- **Najbliższe rezerwacje**: gęsta tabela (kod, gość, jednostka, termin, noce,
  kanał, kwota, status),
- **alerty**: nieprzeczytane wiadomości gości i możliwe podwójne rezerwacje
  (konflikt kanał × bezpośrednia) z linkami do właściwych zakładek,
- pusty stan onboardingu po rejestracji („dodaj pierwszy typ pokoju”).

*Pliki:* `app/admin/page.tsx`, `app/admin/layout.tsx`,
`components/admin/AdminNav.tsx`, `components/admin/AdminTopbar.tsx`

### 3.2 Rezerwacje (`/admin/rezerwacje`)

- **Lista**: zakładki statusów z licznikami (Wszystkie / Oczekujące /
  Potwierdzone / Anulowane), wyszukiwarka po kodzie, nazwisku i e-mailu
  (parametr `q` — podpięta też pod globalną wyszukiwarkę topbara), eksport
  CSV, paginacja po 50; wiersz: kod, gość (z badge nieprzeczytanych
  wiadomości i meldunku), jednostka, termin, noce, kanał, kwota (z rabatem),
  status oraz szybkie akcje Potwierdź / Anuluj.
- **Szczegóły** (`/admin/rezerwacje/[id]`): oś statusu **Rezerwacja →
  Płatność → Meldunek online → Przyjazd → Wyjazd** z datami; karta pobytu
  ze zdjęciem jednostki i rozbiciem ceny (noce × stawka, rabat, razem);
  czat z gościem; sidebar: karta gościa (z automatycznym wykrywaniem gościa
  powracającego — „N-ty pobyt”), meldunek online (podgląd karty / ręczna
  wysyłka linku), płatność (zaliczka / dopłata przy pobycie / pasek postępu),
  faktury (rejestr + wystawianie). Formularz edycji: zmiana terminu
  (z kontrolą dostępności i ewentualnym przydziałem innej jednostki tego
  samego typu — gość dostaje e-mail), liczba gości, cena, dane kontaktowe,
  NIP, notatki.
- **Rezerwacja ręczna** (`/admin/rezerwacje/nowa`): dla rezerwacji
  telefonicznych/osobistych — od razu CONFIRMED, cena z cennika albo
  nadpisana ręcznie, e-mail opcjonalny (gość z e-mailem dostaje potwierdzenie
  i link do meldunku); obok ściąga cennika bazowego.

*Pliki:* `app/admin/rezerwacje/**`, `lib/actions.ts`

### 3.3 Kalendarz obłożenia (`/admin/kalendarz`)

Oś czasu **jednostki × dni**: widok 2 tygodnie (przewijany o 14 dni) lub
pełny miesiąc. Paski rezerwacji pozycjonowane procentowo, kolor wg źródła:
zielony pełny = bezpośrednia potwierdzona, bursztynowy = oczekuje na płatność,
jasnozielony = import iCal (OTA), szary = blokada ręczna. Pasek klika się do
szczegółów rezerwacji. Nagłówek wyróżnia weekendy i dziś. Pod siatką
podsumowanie okna: % obłożenia, wolne jednostko-noce, przychód z okna
(proporcjonalny udział rezerwacji przecinających okno) i licznik rezerwacji
do wyjaśnienia. Niżej zarządzanie **blokadami** (remont, użytek własny) —
dodawanie i usuwanie; blokady iCal są tylko do odczytu.

*Pliki:* `app/admin/kalendarz/page.tsx`

### 3.4 Goście — CRM (`/admin/goscie`)

Baza gości budowana **automatycznie z rezerwacji** (bez osobnego modelu):
grupowanie po e-mailu (rezerwacje ręczne bez e-maila — po nazwisku
i telefonie), najnowsze dane kontaktowe wygrywają. KPI: liczba gości,
powracający (z % bazy), goście z meldunkiem online (potwierdzony e-mail),
średnia ocena pobytów. Tabela: gość (z badge meldunku), kontakt, liczba
pobytów (+ anulowane), suma wydatków, ostatni pobyt oraz **tag**:
VIP (≥3 pobyty lub ≥3000 zł), Powracający (≥2), Nowy. Wyszukiwarka po
imieniu/e-mailu/telefonie; link „Rezerwacje →” otwiera przefiltrowaną listę.

*Pliki:* `app/admin/goscie/page.tsx`

### 3.5 Płatności (`/admin/platnosci`)

Rejestr rozliczeń zbudowany z rezerwacji. KPI: przychód miesiąca (ciemna
karta), suma zaliczek opłaconych online (z liczbą transakcji), rezerwacje
potwierdzone ręcznie (rozliczane na miejscu) i wyróżniona bursztynowa karta
„Oczekuje na płatność”. Tabela transakcji: data, gość + kod, metoda
(Przelewy24 / na miejscu), typ (zaliczka / pełna kwota), kwota, status
(zaksięgowana / potwierdzona ręcznie / oczekuje / wygasła). Przełącznik do
zakładek Faktury i Konfiguracja oraz eksport CSV.

Zakładka **Konfiguracja** (`/admin/platnosci/konfiguracja`): właściciel
podpina własne konto Przelewy24 (Merchant ID, POS ID, klucz API, CRC,
przełącznik sandbox) — zaliczki gości trafiają bezpośrednio na jego konto,
prowizję bramki rozlicza z P24 (Rezio nie pobiera prowizji od rezerwacji).
Sekrety maskowane, przycisk „Testuj połączenie” (P24 `/testAccess`),
instrukcja onboardingu w 3 krokach; usunięcie danych przywraca symulację.

*Pliki:* `app/admin/platnosci/page.tsx`

### 3.6 Faktury (`/admin/faktury`) — plan Pro

Wystawianie **z rezerwacji** jednym kliknięciem: VAT końcowa / zaliczkowa /
proforma. Numeracja kolejna per seria+rok+obiekt (FV/FZ/PRO n/rrrr), rozbicie
brutto → netto + VAT (8/23/5/0%), snapshot danych sprzedawcy (z ustawień
obiektu: nazwa, NIP, adres, konto) i nabywcy (z rezerwacji/karty meldunkowej)
— faktura jest niezmienna po wystawieniu. Rejestr z sumą brutto; widok
dokumentu przygotowany do druku/PDF (`window.print()`, czytelny w czerni
i bieli).

*Pliki:* `app/admin/faktury/**`, `lib/invoices.ts`

### 3.7 Pokoje (`/admin/pokoje`)

CRUD typów pokoi (nazwa, opis, maks. gości, cena bazowa, min. pobyt,
udogodnienia z predefiniowanej listy, zdjęcia) i jednostek w ramach typu
(np. P1/P2/P3), z możliwością wyłączenia jednostki ze sprzedaży i linkiem
eksportu iCal per jednostka. Limit jednostek wg planu egzekwowany przy
dodawaniu.

*Pliki:* `app/admin/pokoje/page.tsx`, `lib/amenities.ts`, `lib/photos.ts`

### 3.8 Cennik (`/admin/cennik`)

Ceny bazowe per typ pokoju, **sezony** (zakresy dat z własną ceną i min.
pobytem), **kody promocyjne** (rabat %, zakres ważności, limit użyć) oraz
**reguły cen dynamicznych** (Pro — weekend / last minute / obłożenie,
z parametrem i korektą %, włączane przełącznikiem).

*Pliki:* `app/admin/cennik/page.tsx`, `lib/pricing.ts`, `lib/dynamic-pricing.ts`

### 3.9 Opinie (`/admin/opinie`)

Podsumowanie (duża średnia, rozkład ocen 5→1 na paskach, wskaźnik
odpowiedzi) + lista opinii z kodem rezerwacji. Akcje: **publiczna odpowiedź
obiektu** (widoczna na stronie obiektu) i **moderacja** ukryj/przywróć
(opinie nie są kasowane).

*Pliki:* `app/admin/opinie/page.tsx`, `lib/reviews.ts`

### 3.10 Raporty (`/admin/raporty`) — plan Pro

Miesięczny przegląd z nawigacją po miesiącach: KPI (przychód, obłożenie,
ADR, RevPAR), przychód dzienny (wykres słupkowy), sprzedaż wg kanału
z szacunkiem zaoszczędzonych prowizji, wyniki per typ pokoju. Eksport CSV
całości danych (`/api/admin/export`).

*Pliki:* `app/admin/raporty/page.tsx`

### 3.11 Ustawienia obiektu (`/admin/obiekt`)

Layout z boczną subnawigacją sekcji: **Dane obiektu** (nazwa, opis, adres),
**Zdjęcia** (okładka + galeria, upload do Vercel Blob), **Zasady pobytu**
(godziny zameldowania/wymeldowania, % zaliczki, instrukcje przyjazdu
odblokowywane meldunkiem), **FAQ gości** (z podpowiedziami typowych pytań),
**Dane do faktur** (sprzedawca, NIP, konto), **Regulamin i RODO** (teksty
publikowane pod `/o/[slug]/regulamin`). Skróty do Jednostek i Kanałów.

*Pliki:* `app/admin/obiekt/page.tsx`, `lib/faq.ts`

### 3.12 Plan i abonament (`/admin/plan`)

Porównanie planów z wyróżnieniem aktywnego; zmiana planu w górę z kontrolą
limitu jednostek (downgrade poniżej liczby posiadanych jednostek wymaga
superadmina).

*Pliki:* `app/admin/plan/page.tsx`, `lib/plans.ts`

---

## 4. Channel manager

Zakładka **Kanały** (`/admin/kanaly`), plan Standard+:

- **Import iCal** z Booking.com / Airbnb / Vrbo (presety z instrukcjami
  gdzie znaleźć link) — zajęte terminy lądują jako blokady `source=ICAL`
  przypięte do feedu; feed pokazuje czas ostatniej synchronizacji i błędy,
- **Eksport iCal per jednostka** — URL z sekretnym tokenem; eksport **nie
  zawiera terminów zaimportowanych z innych kanałów** (ochrona przed pętlą
  synchronizacji),
- **synchronizacja automatyczna co godzinę** (`instrumentation.ts` self-host /
  Vercel Cron) + ręczna (wszystkie feedy albo pojedynczy),
- **wykrywanie podwójnych rezerwacji**: przecięcie blokady iCal z rezerwacją
  bezpośrednią podnosi alert na pulpicie i listę konfliktów w zakładce.

Pełne API dwukierunkowe (ceny, dostępność real-time) — faza 2, wymaga
certyfikacji partnerskiej u OTA.

*Pliki:* `app/admin/kanaly/page.tsx`, `lib/ical.ts`, `lib/channels.ts`,
`app/api/ical/[unitId]/route.ts`, `app/api/cron/sync-ical/route.ts`

---

## 5. Superadmin

Panel platformy (`/superadmin`, konto z `isAdmin`) — wspólny layout
z zakładkami **Pulpit / Rezerwacje / Opinie**:

- **pulpit**: MRR wg planów, liczba kont i obiektów, rezerwacje i GMV
  (30 dni / od początku), **trend wzrostu 6 miesięcy** (GMV + liczba
  rezerwacji + nowe obiekty per miesiąc, wykres słupkowy), **zdrowie
  platformy** (aktywne rezerwacje oczekujące, zawieszone obiekty, feedy
  iCal z błędami — z linkami do kart obiektów), rozkład planów,
- **tabela obiektów** z wyszukiwarką (nazwa / slug / e-mail właściciela)
  i zmianą planu inline (pomija limity jednostek),
- **rezerwacje platformy** (`/superadmin/rezerwacje`): globalny podgląd
  wszystkich rezerwacji — zakładki statusów, wyszukiwarka (kod, gość,
  e-mail, nazwa obiektu), filtr per obiekt (`?pid=`), paginacja,
- **opinie platformy** (`/superadmin/opinie`): globalna moderacja ponad
  moderacją obiektu — podgląd wszystkich opinii łącznie z ukrytymi,
  ukrywanie/przywracanie, filtr „tylko ukryte”,
- **karta obiektu** (`/superadmin/obiekt/[id]`): edycja danych obiektu
  (nazwa, slug z kontrolą unikalności, plan, % zaliczki, godziny, adres,
  opis) i konta właściciela (imię, e-mail), wysyłka linku resetu hasła,
  statystyki, **5 ostatnich rezerwacji** (z przejściem do pełnej listy),
  alert o feedach iCal z błędami,
- **impersonacja** — „Zaloguj jako właściciel”: administrator wchodzi do
  panelu recepcji obiektu na sesji właściciela (wsparcie techniczne);
  sesja admina jest zastępowana, nie można impersonować innych adminów,
  każda impersonacja trafia do dziennika zdarzeń,
- **konfiguracja integracji** (`/superadmin/ustawienia`): Resend (klucz API,
  nadawca) i SMSAPI (token, pole nadawcy) — wartości zapisywane w bazie
  (`PlatformSetting`) **mają pierwszeństwo nad zmiennymi środowiskowymi**
  (ENV pozostaje fallbackiem); sekrety pokazywane wyłącznie jako maska
  końcówki, puste pole przy zapisie = bez zmian, sekcję można wyczyścić
  (powrót do ENV); przycisk „Wyślij testowy e-mail” weryfikuje konfigurację,
- **dziennik zdarzeń** (`/superadmin/logi`): rezerwacje, płatności, wysyłki
  e-mail/SMS (sukcesy i błędy), błędy synchronizacji iCal, nieudane
  logowania i wszystkie akcje administratora (zmiana planu, zawieszenie,
  usunięcie, impersonacja, zmiany konfiguracji) — filtry po rodzaju
  i poziomie (INFO/WARN/ERROR), paginacja, retencja 90 dni (cron),
- **zawieszenie obiektu** — znika z katalogu, strona rezerwacji niedostępna,
  nowe rezerwacje blokowane także w server action; odwracalne,
- **trwałe usunięcie** — obiekt + konto właściciela + cała historia,
  z potwierdzeniem przez przepisanie sluga, kaskadowo w transakcji.

*Pliki:* `app/(site)/superadmin/**`, `components/admin/SuperNav.tsx`,
`lib/auth.ts` (`requireSuperadmin`), `lib/settings.ts` (odczyt baza→ENV),
`lib/log.ts` (`logEvent`), akcje `super*` w `lib/actions.ts`

---

## 6. Automatyzacje (cron)

Endpointy `app/api/cron/*` chronione `CRON_SECRET`; harmonogram w
`vercel.json` (self-host: timer w `instrumentation.ts`).

| Zadanie | Kiedy | Co robi |
|---|---|---|
| `expire-reservations` | codziennie 8:00 UTC | wygasza PENDING po 30 min blokady; kasuje karty meldunkowe (PII) 12 mies. po wymeldowaniu; czyści dziennik zdarzeń (wpisy > 90 dni); wysyła **przypomnienia o jutrzejszym przyjeździe** (e-mail + SMS, z linkiem do meldunku jeśli niewypełniony) i **prośby o opinię** dzień po wymeldowaniu (raz na rezerwację) |
| `sync-ical` | codziennie 4:00 UTC (+ co godzinę w runtime) | synchronizuje wszystkie feedy iCal |

*Pliki:* `lib/jobs.ts`, `app/api/cron/**`, `instrumentation.ts`

---

## 7. Powiadomienia (e-mail + SMS)

**E-maile** — Resend (env `RESEND_API_KEY`; bez klucza log do konsoli).
Wspólny szablon HTML (≤560 px): zielony header z logo, karta treści
z nagłówkiem, automatyczna linkifikacja URL-i (względne → absolutne),
pierwszy link jako przycisk CTA, stopka. Wysyłane przy: utworzeniu
rezerwacji, potwierdzeniu wpłaty, zmianie terminu, anulowaniu, meldunku
(gość + właściciel), nowej wiadomości na czacie, resecie hasła,
przypomnieniu o przyjeździe i prośbie o opinię. Błąd wysyłki nigdy nie
wywraca operacji biznesowej.

**SMS-y** — SMSAPI (env `SMSAPI_TOKEN`; bez tokenu log do konsoli), plan
Standard+; numery normalizowane do `+48…`. Potwierdzenie rezerwacji z linkiem
do meldunku, przypomnienie dzień przed przyjazdem, prośba o opinię — wysyłka
**wyłącznie w godzinach 8–21**, żeby nie budzić gości.

*Pliki:* `lib/mailer.ts`, `lib/sms.ts`

---

## 8. Design system „1c Zieleń wiodąca”

Pełny redesign wg handoffu projektowego (logo wariant D — „R” z odznaką ✓).
Żywy przewodnik: **`/styleguide`** (noindex) — kolory, typografia, logo
i wszystkie komponenty z przykładami.

- **Tokeny** (`app/globals.css`, Tailwind 4 `@theme`): zieleń marki
  (`brand-900 #123829` rail/przyciski, `brand-400 #4ade9b` mint,
  `brand-600 #1f7a4d` akcenty na jasnym tle), neutralne z zielonym podtonem
  (nadpisany `slate`), statusy (bursztyn/info/cegła). Klasy narzędziowe:
  `.th` (nagłówki tabel), `.tnum` (JetBrains Mono + tabular-nums — kody
  i kwoty), `.nums` (tabular-nums dla dużych KPI).
- **Typografia**: Space Grotesk (UI, nagłówki z trackingiem −0.02em)
  + JetBrains Mono (kody `HO-XXXX`, kwoty) przez `next/font`.
- **UI kit** (`components/ui/`): Button (primary/accent/quiet/ghost/danger),
  Card/CardHeader/CardBody, Badge (7 tonów), Toggle i Segmented (czysty CSS —
  działają w formularzach serwerowych bez JS), Tabs, Stepper, KpiCard
  (wariant jasny i ciemny hero), ProgressBar, EmptyState, Avatar; do tego
  `Logo` (skalowalny wariant D) i shell panelu (`components/admin/`).
- **Zasady**: brak emoji w UI (ikony lucide-react, stroke 2), promień kart
  14 px, tabele o wysokiej gęstości z hoverem, waluta `1 650 zł`, daty pl
  („10–13 lip”).

---

## 9. Bezpieczeństwo i RODO

- **Hasła**: scrypt z solą (`lib/password.ts`); sesje w bazie, cookie
  httpOnly 30 dni; reset hasła tokenem ważnym 1 h (unieważnia wszystkie
  sesje).
- **Izolacja tenantów**: każda strona/akcja panelu przez `requireOwner()`,
  mutacje weryfikowane helperami `owned*` względem `propertyId`; superadmin
  osobną barierą `requireSuperadmin()`.
- **RODO**: karta meldunkowa bez skanów dokumentów (tylko typ + numer,
  maskowany na listach), automatyczna retencja PII 12 miesięcy po
  wymeldowaniu, zgody (RODO przy rezerwacji, publikacja przy opinii,
  akceptacja regulaminu przy meldunku), polityka prywatności per obiekt.
- **Płatności**: weryfikacja podpisu webhooka P24 (`lib/payments.ts`);
  sekretne tokeny w URL-ach eksportu iCal.

---

## 10. Testy

- **Jednostkowe** (`npm test`, Vitest — 93 testy): daty, wyceny, faktury,
  meldunek, SMS-y, opinie, płatności P24, konfiguracja stron WWW, sanityzacja
  HTML, routing hostów, domeny (`lib/*.test.ts`).
- **E2E** (`npm run test:e2e`, Playwright — 12 scenariuszy,
  `tests/e2e/`):
  - pełna ścieżka gościa: strona obiektu → dostępność → rezerwacja →
    zaliczka (symulacja) → **meldunek z rysowanym e-podpisem**,
  - panel recepcji: login, pulpit, ręczna rezerwacja → lista → szczegóły,
    wyszukiwarka, Goście/Płatności/Kalendarz,
  - superadmin: pulpit z trendem, globalne rezerwacje i opinie,
    **impersonacja właściciela**,
  - auth: błędne hasło, ochrona panelu przed niezalogowanymi,
  - kreator strony WWW: gating planów, wizard → edycja → publikacja →
    strona live na subdomenie, 404 dla nieznanych hostów.
  Testy chodzą na dedykowanym porcie **3100** (dev server startowany przez
  Playwright) i bazie z `.env` (dane znakowane `E2E …`), jeden worker
  (limit puli połączeń).

---

## 11. Mapa tras

| Trasa | Opis |
|---|---|
| `/` | landing + katalog obiektów |
| `/blog` (+ `/[slug]`) | blog / poradnik (pliki .md, SSG) |
| `/styleguide` | żywy przewodnik design systemu (noindex) |
| `/login`, `/rejestracja`, `/zapomniane-haslo`, `/reset-hasla/[token]` | auth (split-layout) |
| `/o/[slug]` (+ `/pokoj/[id]`, `/wyniki`, `/regulamin`) | publiczna strona obiektu |
| `/rezerwuj/[unitTypeId]` | dane gościa + zaliczka |
| `/r/[kod]` (+ `/meldunek`, `/opinia`) | panel gościa |
| `/moja-rezerwacja` | wyszukanie rezerwacji po kodzie i e-mailu |
| `/admin` | pulpit recepcji |
| `/admin/rezerwacje` (+ `/[id]`, `/[id]/karta`, `/nowa`) | rezerwacje |
| `/admin/kalendarz` | kalendarz obłożenia + blokady |
| `/admin/goscie`, `/admin/platnosci` | CRM gości, rejestr płatności |
| `/admin/faktury` (+ `/[id]`) | faktury (Pro) |
| `/admin/kanaly` | channel manager iCal |
| `/admin/pokoje`, `/admin/cennik` | oferta i ceny |
| `/admin/opinie`, `/admin/raporty` | opinie (moderacja), raporty (Pro) |
| `/admin/obiekt`, `/admin/plan` | ustawienia, abonament |
| `/admin/strona` | kreator strony WWW obiektu (Standard+) |
| `/podglad-strony` | podgląd roboczej wersji strony WWW (tylko właściciel) |
| `nazwa.rezop.pl` → `/sites/[host]` | opublikowana strona WWW obiektu (+ `sitemap.xml`, `robots.txt` per host) |
| `/superadmin` (+ `/rezerwacje`, `/opinie`, `/obiekt/[id]`) | panel platformy |
| `/api/ical/[unitId]`, `/api/payments/p24`, `/api/cron/*`, `/api/admin/export` | integracje |
| `/api/sites/availability`, `/api/sites/inquiry` | widget kalendarza i formularz kontaktowy stron WWW |

---

## 12. Strona WWW obiektu (kreator)

Moduł **„Strona WWW"** w panelu (`/admin/strona`) pozwala właścicielowi zbudować
stronę-wizytówkę obiektu bez wiedzy technicznej i opublikować ją na subdomenie
`nazwa.rezop.pl` (env `SITES_BASE_DOMAIN`), a w planie Pro — pod własną domeną.

- **Gating planów** (`sitePlanFeatures`): FREE — zachęta do upgrade'u;
  Standard — kreator + subdomena; Pro — dodatkowo własna domena.
- **Wizard startowy** (4 kroki): szablon (górski / nadmorski / miejski /
  uniwersalny) → potwierdzenie danych z Rezio → paleta i typografia → adres.
  Strona od razu wypełnia się danymi obiektu (nazwa, opis, pokoje, zdjęcia) —
  nigdy nie startuje pusta.
- **Edytor sekcji**: hero, o obiekcie, apartamenty, galeria (lightbox),
  udogodnienia, kalendarz dostępności i cen (dane na żywo z API), atrakcje
  okolicy, opinie, kontakt (formularz + mapa), własny kod HTML. Widoczność
  i kolejność sekcji, formularze per sekcja, podgląd draftu w iframie
  (desktop/mobile). Sekcje danych nie kopiują treści — czytają z tabel Rezio.
- **Draft/publikacja**: edytor pracuje na `Site.draftConfig`; „Opublikuj"
  kopiuje draft → `publishedConfig` (+ revalidate ISR), „Cofnij zmiany"
  przywraca opublikowaną wersję. Strona publiczna renderuje wyłącznie
  opublikowaną konfigurację (ISR 300 s).
- **„Konwertuj na własny kod"**: odpięcie sekcji generowanej — zamiana na
  statyczny HTML (ostrzeżenie: dane przestają się aktualizować).
- **Bezpieczeństwo**: HTML użytkownika sanityzowany allowlistą przy renderze
  (`lib/sanitize.ts`, bez skryptów; iframe tylko YouTube/mapy), własny CSS
  bez możliwości wyjścia z tagu `<style>`.
- **Routing hostów**: `proxy.ts` klasyfikuje host (`lib/site-host.ts`)
  i przepisuje subdomeny oraz domeny własne na `/sites/[host]`. Lokalnie
  działa `nazwa.localhost:3000` bez konfiguracji.
- **Własna domena (Pro)**: abstrakcja `DomainProvider` (`lib/domains.ts`),
  implementacja Vercel API (env `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`,
  opcjonalnie `VERCEL_TEAM_ID`; brak = sekcja ukryta). Panel pokazuje rekordy
  DNS, status (Oczekuje / Zweryfikowana / Błąd) i instrukcję krok po kroku;
  SSL wystawia Vercel automatycznie. Warianty `www` z przekierowaniem na apex.
- **SEO**: metadata + Open Graph z konfiguracji (fallback: dane obiektu),
  JSON-LD `LodgingBusiness`, canonical, `sitemap.xml` i `robots.txt` per host.
- **Rezerwacja (hybryda)**: widget kalendarza i ceny na stronie klienta,
  finalizacja na istniejącym flow `appUrl/rezerwuj/[unitTypeId]`; zapytania
  z formularza kontaktowego idą e-mailem do właściciela (honeypot antyspam).
