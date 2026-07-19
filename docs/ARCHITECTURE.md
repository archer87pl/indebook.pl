# Rezio — architektura i stan systemu

> Dynamic pricing dla najmu krótkoterminowego na rynku polskim (odpowiednik PriceLabs).
> Stan na 2026‑07‑17 · plany 1–9 zaimplementowane i zmergowane · **176 testów zielonych**.

---

## 1. Czym jest Rezio

Rezio liczy **dynamiczne, dzienne ceny** dla obiektów najmu krótkoterminowego i wyjaśnia,
*dlaczego* cena jest taka, a nie inna. Rdzeniowa teza produktu: cena nie jest czarną skrzynką,
tylko iloczynem sześciu zrozumiałych mnożników (sezon, dzień tygodnia, wyprzedzenie, obłożenie,
popyt), które host widzi w rozbiciu.

Model biznesowy (jak PriceLabs): Rezio nie integruje się bezpośrednio z Airbnb/Booking, tylko
z warstwą pośrednią (channel manager / własny system rezerwacji), która propaguje ceny do OTA.

---

## 2. Architektura (aktualna)

**Modularny monolit + osobny scraper. Bez brokera.**

```
   ┌──────────────────────────────────────────────────────┐
   │  Rezio.Api  (monolit, :8080)                          │
   │  Panel administratora (/) + REST API                  │
   │                                                       │
   │   ┌─────────┐   ┌────────┐   ┌───────────────┐        │
   │   │ pricing │◀──│ demand │   │ channel-sync  │        │   moduły —
   │   │  modul  │   │ modul  │   │    modul      │        │   wywołania
   │   └────┬────┘   └────────┘   └───────┬───────┘        │   W PROCESIE
   │        │  (popyt inline)             │ (push cen)     │
   │        ▼                             ▼                │
   │   MarketDataStore ───────────▶ RatePushService        │
   │        │  obłożenie (trwałe, 7-dniowa świeżość)       │
   └────────┼──────────────────────────────────────────────┘
            │                              ▲
            ▼                              │ POST /v1/internal/market-stats
       ┌─────────┐                  ┌──────┴──────┐
       │ Postgres│                  │ scraper-api │  (:8082, osobny serwis)
       └─────────┘                  └─────────────┘
```

- **Jeden proces** (`Rezio.Api`) obsługuje wycenę, popyt, połączenia i panel — komunikacja
  między modułami to zwykłe wywołania metod.
- **Scraper** jest osobno (inny profil: proxy, ryzyko blokad, inne skalowanie) i przekazuje
  statystyki rynku **po HTTP** (`POST /v1/internal/market-stats`), odporny na niedostępność monolitu.
- **Bez RabbitMQ / MassTransit** — usunięte w planie 8 jako przedwczesna złożoność (patrz §11).

### Fizyczny układ projektów

```
services/
  monolith/src/Rezio.Api/          ← host monolitu (API + wwwroot + persystencja EF)
  monolith/tests/Rezio.Api.Tests/
  scraper/src/Rezio.Scraper.Api/   ← osobny serwis scrapera
  scraper/src/Rezio.Scraper.Domain/
  pricing/src/Rezio.Pricing.Domain/     ← czysta domena wyceny (referowana przez monolit)
  demand/src/Rezio.Demand.Domain/       ← czysta domena popytu
  channelsync/src/Rezio.ChannelSync.Domain/  ← czysta domena kanałów
  (+ *.Domain.Tests dla każdego)
```

Zasada przewijająca się przez całość: **domena jest czysta** (bez sieci, zegara, losowości,
za interfejsami) — dlatego jest trzonem testów i przetrwała wszystkie przebudowy nietknięta.

---

## 3. Jak powstaje cena (moduł pricing)

Dla **każdego dnia** w zakresie:

```
cena = base_price
     × SeasonFactor        (krzywa sezonowa per typ rynku: Bałtyk latem ×1.35, góry zimą ×1.25)
     × DayOfWeekFactor     (piątek/sobota ×1.15, inaczej ×1.00)
     × LeadTimeFactor      (last-minute ×0.90 … z dużym wyprzedzeniem ×1.05)
     × OccupancyFactor     (obłożenie okolicy: ≥85% → ×1.15, <30% → ×0.90)
     × DemandFactor        (popyt 0–100 → mnożnik 0.75–1.25)
→ zaokrąglenie do pełnych PLN (away-from-zero)
→ clamp(min_price, max_price)          ← twardy bezpiecznik
```

`PricingEngine.Recommend()` składa mnożniki i zwraca `PriceRecommendation` z **rozbiciem na
składniki** (`components`) oraz flagą `clamped_by` (`min_price`/`max_price`/null). To rozbicie
jest wyróżnikiem — host widzi każdy mnożnik osobno.

Kluczowe klasy: `PricingEngine`, `SeasonFactor`, `DayOfWeekFactor`, `LeadTimeFactor`,
`OccupancyFactor`, `DemandFactor`, `ListingSettings`, `MarketDaySnapshot`.

---

## 4. Jak liczy się popyt (moduł demand)

`DemandScoreCalculator` startuje od **baseline 50** i dokłada wagi sygnałów kalendarzowych,
różne per typ rynku (np. Boże Ciało w długi weekend: góry +25, Bałtyk +20, **miasto biznesowe −10**).

Sygnały:
- **święta** — z ruchomą Wielkanocą (algorytm Meeusa), Bożym Ciałem (Wielkanoc+60), Wigilią
  wolną od 2025;
- **długie weekendy** — ciągi ≥3 dni wolnych z uwzględnieniem **mostków**;
- **mostki** — dzień roboczy między dniami wolnymi;
- **przedświęta**;
- **ferie zimowe per województwo** — harmonogram MEN 2026 (rotacyjny podział na 3 tury).

Wynik (0–100) + lista driverów (np. „Boże Ciało", „długi weekend", „ferie zimowe (małopolskie)")
wchodzi jako `DemandFactor` do silnika. Popyt liczony jest **inline w procesie** — pricing woła
kalkulator bezpośrednio.

Kluczowe klasy: `PolishHolidayCalendar`, `CalendarSignals`, `WinterBreakCalendar`,
`DemandScoreCalculator`, `DemandWeights`, `Voivodeship`, `IMarketRegistry`.

---

## 5. Skąd biorą się dane rynkowe (scraper)

Scraper to osobny serwis. Przepływ jednego scrape'a:

```
POST /v1/scrape-jobs {mkt_gdansk, 06-01..06-10}     → scraper-api
    ├─ SyntheticListingSource   ← 30 ofert (deterministycznie, BEZ sieci — realny adapter
    │                              Airbnb/Booking wejdzie za tę samą abstrakcję IListingSource)
    ├─ ListingClassifier        ← kategoria (domek/apartament/agroturystyka…) + tagi (widok_gory…)
    ├─ MarketAggregator         ← mediana ceny, obłożenie, liczba aktywnych ofert per dzień
    └─ POST /v1/internal/market-stats  → monolit zapisuje obłożenie do Postgresa
```

Monolit czyta obłożenie z **kontrolą świeżości**: dane starsze niż **7 dni** degradują się do
fallbacku `0.70` (spec §6). Bez danych ze scrapera wycena i tak działa (fallback).

Kluczowe klasy: `IListingSource`, `SyntheticListingSource`, `ListingClassifier`,
`MarketAggregator`, `ScrapeRunner`, `ScrapeAndPublish`.

---

## 6. Jak cena trafia dalej (moduł channel-sync)

```
POST /v1/listings/lst_demo/publish-prices {connection_id, external_listing_id, from, to}
    ├─ policz kalendarz cen (silnik jak w §3)
    ├─ RatePlanValidator   ← „pełny kalendarz albo NIC" (brak luk, duplikatów, cen ≤0)
    └─ RatePushService     ← push z retry + backoffem; adapter połączenia
```

`SyntheticChannelAdapter` udaje Beds24/Smoobu/Hostaway (prawdziwe adaptery = przyszłość, wymagają
kluczy API). Bezpiecznik „pełny kalendarz albo nic" gwarantuje, że nigdy nie wysyłamy połowicznego
cennika. Push jest **w procesie** (`PricePusher`) — bez brokera.

Kluczowe klasy: `IChannelAdapter`, `SyntheticChannelAdapter`, `ConnectionRegistry`,
`RatePlanValidator`, `BackoffPolicy`, `RatePushService`, `SyncRunner`, `IAdapterFactory`, `PricePusher`.

---

## 7. Persystencja i świeżość (EF Core + Postgres)

- `MarketDataStore` (interfejs `IMarketDataStore`) w dwóch wariantach:
  - `InMemoryMarketDataStore` — domyślny, gdy brak `DATABASE_URL`;
  - `EfMarketDataStore` — Postgres/EF Core (tabela `market_data`, klucz `(MarketId, Date)`).
- **Świeżość:** każdy wpis ma `LastWrittenAt`; odczyt zwraca dane tylko, jeśli ≤7 dni, inaczej
  null-object → fallback syntetyczny. Reguła identyczna w obu wariantach.
- Migracja Npgsql aplikowana na starcie (gdy `DATABASE_URL` ustawione).
- Testy EF na **SQLite in-memory** (realny SQL, deterministyczne, bez Dockera w CI).
- Dane przeżywają restart kontenera (potwierdzone e2e).

Świadomy kompromis MVP: przy współbieżnym `UPDATE` do Postgresa jest ryzyko lost-update
(brak tokenu współbieżności) — insert-race jest już zahartowany (catch + reload + merge).

---

## 8. Panel administratora (frontend)

- Serwowany przez monolit pod **`/`** ze statycznego `wwwroot/index.html` (vanilla HTML/CSS/JS,
  bez frameworka, bez zewnętrznych zasobów — CSP-safe, tryb jasny/ciemny).
- Rynki są **danymi, nie kodem**: przy starcie strony `boot()` woła `GET /v1/markets`, dostaje
  `{markets:[{id,name,type,voivodeship,lat,lng}]}`, przelicza `lat/lng → x/y` na mapie SVG
  (`geoToXY`) i z tego buduje pinezki + pogrupowaną listę. Panel nie zawiera zakodowanej listy
  rynków — dodanie rynku to edycja `Data/markets.json`, bez zmian w kodzie.
- Wybór rynku na **mapie Polski**, kategoria/tagi (profil obiektu), cena bazowa, zakres dat.
- Woła **realny backend** `POST /v1/quote` — zero liczenia w JS, więc nie rozjedzie się z produkcją.
- Renderuje: cenę za noc, rozbicie na mnożniki (słupki), drivery popytu, pasek dni.
- `QuoteService` wycenia **dowolny** z 44 rynków (nie tylko sztywny `lst_demo`) — system pokrywa
  44 polskie rynki (data-driven, `services/monolith/src/Rezio.Api/Data/markets.json`, ładowane
  przez `MarketCatalog`) w 4 typach (góry / morze / miasto turystyczne / miasto biznesowe)
  rozrzuconych po wszystkich 16 województwach.

Świadome ograniczenie: kategoria i tagi są zbierane jako profil, ale **nie wpływają jeszcze na
cenę** — comp-set-driven pricing to przyszły etap. Panel komunikuje to wprost.

---

## 9. Powierzchnia API

### Monolit `Rezio.Api` (`:8080`)

| Metoda i ścieżka | Opis |
|---|---|
| `GET /` | Panel administratora (HTML) |
| `GET /v1/markets` | Lista rynków (`{markets:[{id,name,type,voivodeship,lat,lng}]}`) — panel buduje z niej mapę i listę |
| `GET /v1/listings/{id}/prices?from=&to=` | Rekomendacje dzienne z rozbiciem (obiekt `lst_demo`) |
| `POST /v1/quote` | Wycena dowolnego rynku (`{market_id, base_price, min_price, max_price, from, to}`) |
| `POST /v1/listings/{id}/publish-prices` | Policz i pushnij ceny (w procesie) |
| `GET /v1/markets/{id}/demand?from=&to=` | Dzienne demand score z driverami |
| `POST /v1/connections` | Utwórz połączenie `{provider}` (beds24/smoobu/hostaway) |
| `GET /v1/connections/{id}` | Status połączenia |
| `GET /v1/connections/{id}/listings` | Oferty z połączenia |
| `POST /v1/connections/{id}/sync` | Synchronizacja (pull ofert + rezerwacji) |
| `POST /v1/internal/market-stats` | Ingest statystyk ze scrapera (obłożenie → Postgres) |
| `GET /health` | Healthcheck (format HealthChecks UI) |

Konwencje: JSON snake_case, błędy problem+json, limit zakresu dat `≥365 dni → 400`,
walidacja cen (`base>0`, `min≤max` → 400).

### Scraper `Rezio.Scraper.Api` (`:8082`)

| Metoda i ścieżka | Opis |
|---|---|
| `POST /v1/scrape-jobs` | Uruchom scrape `{market_id, from, to}` → agregaty + POST do monolitu |
| `GET /v1/markets/{id}/stats?from=&to=` | Zescrapowane statystyki rynku |
| `GET /health` | Healthcheck |

---

## 10. Co jest prawdziwe, a co udawane (uczciwie)

| Prawdziwa logika produkcyjna | Syntetyczne (za interfejsem, do podmiany) |
|---|---|
| Silnik cen i wszystkie mnożniki | Źródło ofert (`SyntheticListingSource` zamiast Playwright/Airbnb) |
| Kalendarz świąt/ferii/popytu PL | Adapter CM (`SyntheticChannelAdapter` zamiast Beds24) |
| Persystencja Postgres + świeżość | Mapowanie oferta→rynek (na sztywno `lst_demo`→`mkt_gdansk`) |
| Bezpieczny push (walidacja + retry) | Poświadczenia połączeń (bez sekretów) |
| Panel + `POST /v1/quote` | Comp set (kategoria/tagi nie wpływają jeszcze na cenę) |

Cała „udawana" część siedzi za interfejsami (`IListingSource`, `IChannelAdapter`,
`IMarketDataStore`) — podmiana na realne integracje to dopisanie klasy, nie przebudowa.

---

## 11. Historia decyzji (plany 1–9)

| Plan | Co dostarczył |
|---|---|
| 1 | Monorepo .NET 10 + silnik cen (mnożniki, clamp, rozbicie) + `GET /prices` + Docker/CI |
| 2 | demand-service: kalendarz świąt PL, mostki/długie weekendy, ferie MEN, demand score |
| 3 | market-scraper: klasyfikator taksonomii, agregator, `IListingSource` + źródło syntetyczne |
| 4 | channel-sync: `IChannelAdapter`, walidator „pełny kalendarz albo nic", push z retry |
| 5 | Integracja zdarzeniami (MassTransit + RabbitMQ) — pętla cena→push |
| 6 | Przepływ danych: scraper→pricing, demand→pricing przez broker |
| 7 | Persystencja pricing (EF Core + Postgres) + świeżość danych (§6) |
| **8** | **Konsolidacja: mikroserwisy → modularny monolit; scraper osobno; usunięcie RabbitMQ** |
| 9 | Panel administratora serwowany przez monolit + `POST /v1/quote` |

**Dlaczego zwinięcie do monolitu (plan 8):** po retrospektywie uznaliśmy, że mikroserwisy od
dnia zero były przedwczesną optymalizacją na skalę i zespół, których jeszcze nie ma. Plany 5–6
(integracja zdarzeniami) okazały się w dużej mierze hydrauliką, która w monolicie jest zwykłym
wywołaniem metody. Ponieważ domena była czysta i za interfejsami, odwrócenie kosztowało mało —
zwinęliśmy warstwę transportu, nie logikę. Scraper został osobno, bo jako jedyny ma realnie inny
profil (proxy, blokady, skalowanie). Zasada: **zacznij od monolitu, wydziel gdy zaboli.**

---

## 12. Jak uruchomić

### A. Szybko, bez Dockera (pamięć ulotna)
```bash
dotnet run --project services/monolith/src/Rezio.Api   # panel na wypisanym porcie /
dotnet test                                            # 176 testów
```
Bez `DATABASE_URL` monolit używa `InMemoryMarketDataStore` — działa samodzielnie.

### B. Pełny stos (Postgres + monitoring)
```bash
docker compose up --build
```
Podnosi: `rezio-api` (:8080), `scraper-api` (:8082), `postgres` (:5432), `loki` (:3100),
`grafana` (:3000), `healthchecks-ui` (:8090). Panel: **http://localhost:8080/**.
HealthChecks UI jest pod **`/healthchecks-ui`** (nie w korzeniu).

**Uwaga o portach:** na maszynach deweloperskich porty 8080 (MTAgentService), 8082 (iVMS-4200),
8090 (nginx), 3000 (Grafana) bywają zajęte przez inne aplikacje. Wtedy podnieś stos na wolnych
portach przez override, np. `compose.ports-override.yml` z tagiem `!override` na `ports`, i wołaj
`docker compose -f docker-compose.yml -f compose.ports-override.yml up -d` (adresy na 18080/18082/18090).

Przykład pełnej pętli:
```bash
# scrape → obłożenie ląduje w monolicie
curl -X POST http://localhost:8082/v1/scrape-jobs -H "Content-Type: application/json" \
  -d '{"market_id":"mkt_gdansk","from":"2026-06-01","to":"2026-06-10"}'
# wycena dowolnego rynku
curl -X POST http://localhost:8080/v1/quote -H "Content-Type: application/json" \
  -d '{"market_id":"mkt_zakopane","base_price":450,"min_price":280,"max_price":1200,"from":"2026-06-04","to":"2026-06-07"}'
```

---

## 13. Stack technologiczny

- **Backend:** C# / .NET 10, ASP.NET Core minimal APIs
- **Persystencja:** EF Core 10 + PostgreSQL (Npgsql); SQLite in-memory w testach
- **Frontend:** vanilla HTML/CSS/JS (bez frameworka, bez CDN)
- **Observability:** Serilog → Loki → Grafana; ASP.NET Core HealthChecks + HealthChecks UI
- **Testy:** xUnit; TDD; 176 testów; deterministyczne (bez sieci/brokera w CI)
- **Konteneryzacja:** Docker Compose
- **Docelowy hosting:** Hetzner (UE/RODO, wrażliwość na koszty) — obrazy przenośne, migracja na AWS możliwa bez zmian w kodzie

---

## 14. Odłożone (kolejne kroki)

- **Comp-set-driven pricing** — kategoria/tagi realnie wpływające na obłożenie (tabela `listings`,
  agregaty comp setu). Panel już zbiera profil; backend jeszcze go nie wykorzystuje.
- **Realne adaptery** — scraping Airbnb/Booking (Playwright + proxy) za `IListingSource`;
  prawdziwy Beds24/Smoobu/Hostaway za `IChannelAdapter` + szyfrowanie poświadczeń.
- **Integracja z własnym systemem rezerwacji** — `POST /v1/internal/bookings` (realne obłożenie
  z rezerwacji zamiast scrapingu) — prostsza i dokładniejsza niż zewnętrzny channel manager.
- **api-gateway + auth** — ingest i endpointy są teraz otwarte.
- **Harmonogram** (Quartz.NET) cyklicznego scrape/sync — dziś trigger ręczny.
- **Token współbieżności** na `market_data` (whole-row clawback przy równoległym UPDATE).
- **Ferie 2027** w `WinterBreakCalendar` (MEN publikuje ~czerwiec roku poprzedzającego).

---

*Dokument opisuje stan repo na branchu `master`. Plany szczegółowe: `docs/superpowers/plans/`,
spec produktowy: `docs/superpowers/specs/`.*
