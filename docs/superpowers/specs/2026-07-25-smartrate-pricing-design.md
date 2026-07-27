# Integracja cen dynamicznych SmartRate

Data: 2026-07-25 · Status: zaakceptowany przez właściciela projektu

## Cel

Dać właścicielowi obiektu wybór silnika wyceny: dotychczasowe **podstawowe reguły
RezFlow** (WEEKEND / LAST_MINUTE / OCCUPANCY) albo **zewnętrzne API SmartRate**
(projekt `Rezio.SmartRate` — modularny monolit .NET, dynamic pricing dla rynku PL).
Przełączenie ma być odwracalne, niewidoczne dla gościa i odporne na awarię API.

## Decyzje kluczowe (ustalone z właścicielem)

1. **Przepływ:** hybryda — ścieżka gościa czyta ceny z cache w bazie, a nieświeże
   wpisy odświeżamy w tle (`after()` + cron). Zero HTTP w ścieżce zakupu.
2. **Relacja silników:** SmartRate **zastępuje** reguły; reguły są fallbackiem przy
   awarii API lub braku pokrycia. Silniki nigdy się nie mnożą.
3. **Widełki bezpieczeństwa:** nowe pola `UnitType.minPriceGr` / `maxPriceGr`,
   edytowalne w panelu, domyślnie wyliczane z ceny bazowej (−30% / +80%).
4. **Dostęp do API:** SmartRate dostaje autoryzację nagłówkiem `X-Api-Key`
   (osobna zmiana w repo `Rezio.SmartRate`), RezFlow trzyma sekret w env.
5. **Mapowanie rynku:** właściciel wybiera rynek z listy `GET /v1/markets`
   (89 rynków), z podpowiedzią dopasowaną do adresu obiektu.
6. **Gating:** tryb SmartRate tylko w planie **PRO** (jak własna domena i Channex).

## Kontrakt SmartRate (stan zastany)

`POST /v1/quote` — body `{market_id, base_price, min_price, max_price, from, to}`,
odpowiedź `{market_id, market_name, market_type, currency, days:[...]}`, gdzie każdy
dzień ma `date`, `recommended_price`, `clamped_by` (`min_price`/`max_price`/null),
`occupancy_rate`, `occupancy_source`, `demand_score`, `components` (5 mnożników:
sezon, dzień tygodnia, wyprzedzenie, obłożenie rynku, popyt) i `demand_drivers`.

`GET /v1/markets` — `{markets:[{id,name,type,voivodeship,lat,lng}]}`.

Walidacja po stronie API: `base_price > 0`, `min_price ≤ max_price`, zakres < 365 dni;
błędy w formacie problem+json.

### Trzy niezgodności do pogodzenia w kliencie

| SmartRate | RezFlow | Rozwiązanie |
|---|---|---|
| ceny w PLN (`decimal`) | grosze (`Int`, sufiks `Gr`) | konwersja w kliencie, zaokrąglenie do pełnych groszy |
| `to` **włącznie** | przedział półotwarty `[checkIn, checkOut)` | klient woła z `to = checkOut − 1 dzień` |
| JSON snake_case | camelCase | mapowanie w kliencie, typy tylko po stronie RezFlow |

## Architektura

Nowy katalog `lib/rates/`, wzorowany na `lib/channex/` (abstrakcja + stub + realny
klient wybierany po env):

```
lib/rates/provider.ts    RatesProvider (interfejs), stubProvider, wybór po env
lib/rates/smartrate.ts   klient HTTP: POST /v1/quote, GET /v1/markets
lib/rates/cache.ts       odczyt DynamicRate, TTL, coalesce
lib/rates/refresh.ts     pobranie zakresu → zapis → log błędu na Property
```

```ts
export type RateDay = {
  date: string;
  priceGr: number;
  clampedBy: "min" | "max" | null;
  demandScore: number;
  drivers: string[];
  components: { season: number; dayOfWeek: number; leadTime: number; occupancy: number; demand: number };
};

export interface RatesProvider {
  markets(): Promise<{ id: string; name: string; type: string; voivodeship: string }[]>;
  quote(input: {
    marketId: string;
    basePriceGr: number;
    minPriceGr: number;
    maxPriceGr: number;
    from: string;   // pierwsza noc
    to: string;     // ostatnia noc (włącznie) — konwersja z checkOut w wołającym
  }): Promise<RateDay[]>;
}
```

`stubProvider` liczy deterministycznie (weekend ×1,15, last-minute ×0,9, clamp do
widełek) — dev, vitest i Playwright działają bez dockera z .NET. Wybór providera:
realny gdy ustawione `SMARTRATE_URL` i brak `SMARTRATE_STUB=1`, inaczej stub.

**Bezpieczeństwo wyjścia:** adres bazowy przechodzi przez `assertPublicUrl`
(`lib/net.ts`, ten sam guard co feedy iCal), timeout 5 s, klucz w nagłówku
`X-Api-Key`. Sekrety: `SMARTRATE_URL`, `SMARTRATE_API_KEY` w env (nigdy w repo).

## Model danych

```prisma
// Property
pricingMode        String    @default("BASIC")   // BASIC | SMARTRATE
smartRateMarketId  String    @default("")        // np. mkt_gdansk
smartRateSyncedAt  DateTime?                     // ostatnie udane pobranie
smartRateError     String    @default("")        // ostatni błąd — widoczny w panelu

// UnitType
minPriceGr  Int?   // widełki dla silnika; null = jeszcze nieustawione
maxPriceGr  Int?

model DynamicRate {
  id          Int      @id @default(autoincrement())
  unitTypeId  Int
  unitType    UnitType @relation(fields: [unitTypeId], references: [id])
  date        String   // YYYY-MM-DD, jedna doba
  priceGr     Int
  clampedBy   String?  // min | max | null
  demandScore Int      @default(50)
  drivers     String   @default("[]")  // JSON: ["Boże Ciało", "ferie (małopolskie)"]
  components  String   @default("{}")  // JSON: 5 mnożników — wyjaśnienie ceny w panelu
  fetchedAt   DateTime @updatedAt

  @@unique([unitTypeId, date])
  @@index([unitTypeId, date])
}
```

Przy pierwszym włączeniu trybu SMARTRATE widełki bez wartości wypełniamy z ceny
bazowej typu pokoju: `minPriceGr = round(base × 0,7)`, `maxPriceGr = round(base × 1,8)`.

## Przepływ wyceny

`quoteStayDynamic` (`lib/dynamic-pricing.ts`) zostaje **jedynym wejściem** do wyceny —
sześć istniejących miejsc wywołań (wyniki wyszukiwania, strona rezerwacji,
`createReservation`, zmiana terminu, rezerwacja ręczna) nie wymaga zmian. Funkcja
staje się dyspozytorem:

```
quoteStayDynamic(unitType, from, to, depositPercent, excludeReservationId)
├─ tryb SMARTRATE + plan PRO + ustawiony rynek?
│   ├─ czytaj DynamicRate dla [from, to)
│   ├─ pokrycie pełne  → wycena z cache (+ zlecenie odświeżenia gdy nieświeże)
│   └─ pokrycie niepełne → ścieżka BASIC + zlecenie pobrania
└─ inaczej → ścieżka BASIC (cennik statyczny + reguły PricingRule)
```

**Wszystko albo nic per zakres.** Jeśli w cache brakuje choćby jednej nocy, cała
wycena idzie ścieżką BASIC — ta sama zasada, co „pełny kalendarz albo nic" przy
push-u ARI do Channexa. Gość nigdy nie widzi ceny sklejonej z dwóch silników,
a cena w wyszukiwarce zawsze zgadza się z ceną przy rezerwacji.

Zaliczka i `minStay` liczą się jak dotąd — SmartRate wpływa wyłącznie na cenę nocy.

## Odświeżanie w tle

1. **`after()` w ścieżce gościa** — gdy wpisy są nieświeże (starsze niż
   `SMARTRATE_TTL_HOURS`, domyślnie 12) albo brakuje pokrycia, po odpowiedzi
   zlecamy `refreshRates(unitTypeId, from, to)`. Odpowiedź nigdy nie czeka na HTTP.
2. **Coalesce** — `refreshRates` odpuszcza, jeśli którykolwiek wpis w zakresie ma
   `fetchedAt` młodszy niż 60 s. Bez tego popularny obiekt zasypałby API przy każdym
   wyszukiwaniu.
3. **Cron dzienny** `/api/cron/rates` (istniejący wzorzec fail-closed z bearerem,
   wpis w `vercel.json`) odbudowuje horyzont 180 dni dla obiektów w trybie SMARTRATE.
4. **Inwalidacja** — zmiana `basePriceGr`, sezonu, widełek lub rynku kasuje wpisy
   `DynamicRate` dla dotkniętych typów pokoi; cron i `after()` je odbudują.

`after()` bywa wołane poza zakresem żądania (np. z crona) — jak w `afterAri`,
opakowujemy w try/catch z fallbackiem do wywołania inline.

## Panel właściciela

W `/admin/cennik` dochodzi sekcja **Silnik cen**:

- przełącznik **Podstawowy / SmartRate**; poniżej planu PRO zamiast przełącznika
  zachęta do upgrade'u (wzorzec z modułu strony WWW),
- wybór **rynku** z listy `GET /v1/markets` pogrupowanej po województwie,
  z podpowiedzią dopasowaną do `Property.address`,
- **widełki** `minPriceGr` / `maxPriceGr` per typ pokoju,
- **pasek 30 dni**: rekomendowana cena, znacznik „obcięte do min/max", a po
  rozwinięciu rozbicie na 5 mnożników i drivery popytu. To rozbicie jest głównym
  argumentem SmartRate — bez niego właściciel dostaje czarną skrzynkę,
- **status**: `smartRateSyncedAt` i `smartRateError` (gdy niepuste — alert).

Reguły WEEKEND / LAST_MINUTE / OCCUPANCY zostają widoczne, opisane jako awaryjne
(działają, gdy SmartRate nie odpowiada).

## Obsługa błędów

| Sytuacja | Zachowanie |
|---|---|
| API nie odpowiada / timeout / 5xx | zapis `smartRateError`, wycena ścieżką BASIC, cache nietknięty |
| 400 (złe widełki, zakres) | `smartRateError` z treścią problem+json, wycena BASIC |
| 404 (nieznany rynek) | `smartRateError`, panel podświetla pole rynku |
| brak `SMARTRATE_URL` | stub (dev/test) — nigdy realny ruch sieciowy |
| brak pokrycia w cache | wycena BASIC + zlecenie pobrania w tle |

Awarie są **ciche dla gościa** (zawsze dostaje spójną cenę) i **głośne dla
właściciela** (alert w panelu).

## Testy

**vitest** (`lib/rates/*.test.ts`, opisy po polsku):
- mapowanie kontraktu: grosze ↔ złotówki, `to` włączne ↔ półotwarte, snake_case,
- `stubProvider`: determinizm, clamp do widełek,
- dyspozytor `quoteStayDynamic`: tryb BASIC bez zmian; SMARTRATE z pełnym pokryciem
  bierze ceny z cache; niepełne pokrycie degraduje do reguł,
- cache: TTL, coalesce (drugie wywołanie w ciągu 60 s nie strzela do API),
- inwalidacja przy zmianie ceny bazowej.

**Playwright**: właściciel PRO włącza SmartRate w panelu (stub), wybiera rynek →
cena w wyszukiwarce gościa różni się od statycznej i zgadza się z ceną na stronie
rezerwacji; wyłączenie trybu wraca do reguł.

## Zmiana w repo `Rezio.SmartRate`

Osobny commit: nagłówek `X-Api-Key` na `/v1/quote` i `/v1/markets`, porównywany
w czasie stałym z kluczem z konfiguracji (`SMARTRATE_API_KEY`). Gdy klucz nie jest
skonfigurowany, endpointy zostają otwarte — inaczej wbudowany panel administratora
(vanilla JS pod `/`) przestałby działać na localhoście, a wpisanie klucza w kod
strony i tak by go ujawniło. To świadomy kompromis: **wdrożenie produkcyjne musi
ustawić klucz**, a serwis nie powinien być wystawiony publicznie bez niego.
Testy: 401 przy złym kluczu, 200 przy poprawnym, 200 gdy klucz nieskonfigurowany.

## Poza zakresem

- **Push cen do Channexa** — dzisiejsze ARI wysyła wyłącznie dostępność i `minStay`
  (`lib/channex/ari.ts`); rozszerzenie payloadu o ceny to osobny temat.
- **Comp-set pricing** (kategoria/tagi obiektu wpływające na cenę) — SmartRate
  zbiera te dane, ale jeszcze ich nie używa.
- **Automatyczne mapowanie adres → rynek** — świadomie wybrany ręczny wybór.
- **Zmiany w scraperze i module demand** SmartRate.
