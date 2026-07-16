# Rezio — serwis dynamic pricingu dla polskiego rynku najmu krótkoterminowego

**Data:** 2026-07-16
**Status:** zatwierdzony projekt (spec)

## 1. Cel i model produktu

Rezio to odpowiednik PriceLabs dla rynku polskiego: serwis rekomendujący i automatycznie
ustawiający dzienne ceny ofert najmu krótkoterminowego. Odbiorcą są hosty, a ceny trafiają
do Airbnb/Booking **pośrednio — przez channel managery / PMS-y**, do których host podpina
swoje konto. Rezio nie integruje się bezpośrednio z Airbnb/Booking (wysoki próg partnerski);
integruje się z warstwą pośrednią, tak jak PriceLabs.

Kluczowy wyróżnik produktowy: **wyjaśnialność ceny** — każda rekomendacja zwraca rozbicie
na składniki (sezon, dzień tygodnia, popyt, eventy), żeby host rozumiał i ufał cenom.

## 2. Architektura

Mikroserwisy od początku (decyzja użytkownika). Komunikacja: zdarzenia przez
RabbitMQ (fan-out, DLQ per serwis; w .NET przez MassTransit) + synchroniczne
wywołania wewnętrzne (REST) tam, gdzie potrzebna odpowiedź natychmiastowa.
Każdy serwis ma własną bazę logiczną Postgres — brak współdzielonych tabel
między serwisami.

```
                     ┌──────────────┐
  Airbnb/Booking ───▶│ market-      │──── market.stats.updated ────┐
  (scraping)         │ scraper      │                              ▼
                     └──────────────┘                     ┌──────────────┐
  święta/ferie/      ┌──────────────┐                     │ pricing-     │
  eventy/pogoda ────▶│ demand-      │── demand.score ────▶│ service      │
                     │ service      │                     └──────┬───────┘
                     └──────────────┘                            │ price.updated
                     ┌──────────────┐   listings/reservations    ▼
  Channel managery ◀▶│ channel-sync │◀──────────────────  ┌──────────────┐
  (Beds24, Smoobu…)  └──────────────┘── push cen          │ api-gateway  │◀── klient
                                                          │ + dashboard  │    (host / API)
                                                          └──────────────┘
```

### 2.1 market-scraper
- Scrapuje publiczne wyniki wyszukiwania i kalendarze dostępności Airbnb oraz strony
  Booking.com per zdefiniowana siatka rynków (miasto/dzielnica + typ obiektu).
- Surowe obserwacje → object storage (S3-kompatybilny); agregaty dzienne per rynek
  (mediana ceny, obłożenie, liczba aktywnych ofert, pickup) → Postgres.
- Publikuje `market.stats.updated`.
- Infrastruktura: pula proxy residential, rate limiting, rotacja fingerprintów,
  harmonogram per rynek (duże rynki codziennie, małe co 2–3 dni).
- Zgodność: przechowujemy wyłącznie agregaty i anonimowe atrybuty ofert; żadnych
  danych osobowych hostów (RODO). Ryzyko ToS platform zaakceptowane świadomie
  (standard branżowy), izolowane w tym jednym serwisie.

### 2.2 demand-service
- Ingestuje sygnały popytu i produkuje `demand_score` (0–100) per rynek per data,
  z listą driverów (do wyjaśnialności).
- V1: heurystyka ważona (suma ważonych sygnałów, wagi konfigurowane per typ rynku:
  góry / morze / miasto biznesowe / miasto turystyczne).
- V2: model ML (gradient boosting) przewidujący tempo rezerwacji, uczony na danych
  z channel managerów użytkowników; heurystyka zostaje jako fallback.
- Publikuje `demand.score.updated`.

### 2.3 pricing-service
- Silnik hybrydowy — szkielet regułowy, popyt jako wejście:

  ```
  cena(data) = base_price
             × f_sezon(data, rynek)
             × f_dzień_tygodnia(data)
             × f_lead_time(dni_do_daty)
             × f_obłożenie_rynku(market_stats)
             × f_popyt(demand_score)
             × reguły_usera (weekend uplift, last-minute discount, orphan gap…)
  → clamp(min_price, max_price)
  → limit maksymalnej zmiany dziennej (%)
  ```
- Każdy czynnik zapisany osobno w `components` (jsonb) — pełne rozbicie w API.
- Przelicza kalendarz 365 dni do przodu przy każdym zdarzeniu wejściowym
  (nowe staty rynku, nowy demand score, zmiana ustawień, nowa rezerwacja).
- Publikuje `price.updated`.

### 2.4 channel-sync
- Wspólny interfejs adaptera: `pull_listings()`, `pull_reservations()`, `push_rates()`.
- Kolejność integracji:
  1. **Beds24, Smoobu, Hostaway** — otwarte, samoobsługowe API; popularne w PL.
  2. **Hotres, IdoSell Booking, BedBooking** — polskie; wymagają kontaktu/partnerstwa.
  3. Profitroom/KWHotel — segment hotelowy, poza MVP.
- Push cen: pełny kalendarz albo nic (nigdy częściowy), retry z backoffem,
  po wyczerpaniu prób — webhook `connection.error` + alert w dashboardzie.
- Rezerwacje pobierane cyklicznie → event `reservation.created` (wejście dla
  pricing-service i przyszłego ML).

### 2.5 api-gateway + dashboard
- Publiczne REST API `/v1`, auth: klucze API (integracje) + sesje OAuth (dashboard).
- Webhooks wychodzące: `price.updated`, `sync.completed`, `connection.error`.
- Dashboard (poza zakresem tego specu poza minimalnym MVP): kalendarz cen,
  ustawienia, podgląd rynku.

## 3. Publiczne API `/v1`

| Metoda i ścieżka | Opis |
|---|---|
| `POST /v1/connections` | Podpięcie channel managera `{provider, credentials}` |
| `GET /v1/connections/{id}` | Status połączenia i ostatniej synchronizacji |
| `GET /v1/listings` | Zsynchronizowane oferty |
| `GET /v1/listings/{id}` | Szczegóły oferty |
| `PATCH /v1/listings/{id}/settings` | `base_price`, `min_price`, `max_price`, `aggressiveness`, reguły |
| `GET /v1/listings/{id}/prices?from=&to=` | Rekomendacje dzienne z rozbiciem |
| `POST /v1/listings/{id}/overrides` | Nadpisania `{date_from, date_to, price \| multiplier}` |
| `DELETE /v1/listings/{id}/overrides/{oid}` | Usunięcie nadpisania |
| `POST /v1/listings/{id}/sync` | Natychmiastowy push cen |
| `GET /v1/markets/{id}/stats?from=&to=` | Agregaty rynku: obłożenie, mediana ADR, pickup |
| `POST /v1/webhooks` | Rejestracja endpointu webhooków |

### Przykład: `GET /v1/listings/{id}/prices`

```json
{
  "listing_id": "lst_8f3k2",
  "currency": "PLN",
  "prices": [
    {
      "date": "2026-08-14",
      "recommended_price": 612,
      "components": {
        "base_price": 350,
        "season": 1.30,
        "day_of_week": 1.15,
        "lead_time": 1.00,
        "market_occupancy": 1.10,
        "demand_score": 1.19,
        "demand_drivers": ["długi weekend 15.08", "koncert, Tauron Arena"]
      },
      "override": null,
      "clamped_by": null,
      "market_data_freshness": "2026-07-15"
    }
  ]
}
```

Konwencje: identyfikatory z prefiksem (`lst_`, `con_`, `mkt_`), paginacja kursorem,
błędy w formacie problem+json, wersjonowanie w ścieżce.

## 4. Model danych (kluczowe tabele)

- `users`, `connections(provider, status, credentials_encrypted)`
- `listings(connection_id, external_id, market_id, attrs jsonb)`
- `listing_settings(base_price, min_price, max_price, aggressiveness, rules jsonb)`
- `price_recommendations(listing_id, date, price, components jsonb, pushed_at)`
- `overrides(listing_id, date_from, date_to, price, multiplier)`
- `markets(name, geo, market_type)` — typ: góry/morze/miasto_biznes/miasto_turyst
- `market_daily_stats(market_id, date, median_price, occupancy_rate, active_listings, pickup_7d)`
- `demand_scores(market_id, date, score, drivers jsonb, model_version)`
- `reservations(listing_id, dates, price, booked_at, source)` — zbiór treningowy ML
- `scrape_jobs(market_id, status, started_at, listings_seen)`

## 5. Źródła danych (specyfika rynku polskiego)

### 5.1 Dane rynkowe — własny scraping
- Airbnb: publiczne wyszukiwanie + kalendarze dostępności ofert, per siatka rynków.
- Booking.com: strony wyników z cenami dla konkretnych dat.
- Detekcja obłożenia: dni zablokowane w kalendarzu traktowane jako proxy rezerwacji
  (z korektą — część blokad to niedostępność właścicielska).

### 5.2 Sygnały popytu
| Sygnał | Źródło | Uwagi PL |
|---|---|---|
| Święta i długie weekendy | kalendarz statyczny + reguły mostków | m.in. majówka, 15.08, Boże Ciało |
| **Ferie zimowe per województwo** | harmonogram MEN (publikowany rocznie) | rotacyjny — kluczowy dla Zakopanego, Karpacza, Szklarskiej |
| Eventy | PredictHQ (płatne) lub scraping eBilet / Going. / kalendarze miejskie | koncerty, kongresy, mecze |
| Pogoda | Open-Meteo (darmowe) / IMGW | prognoza na weekend przesuwa popyt last-minute nad Bałtykiem |
| Święta zagraniczne | kalendarze DE/CZ/SK | popyt zagraniczny: wybrzeże, Mazury, góry |
| Sezonowość bazowa | GUS (obłożenie bazy noclegowej per region) | fallback przy braku danych scrapingu |
| Trendy wyszukiwań | Google Trends (frazy destynacyjne) | sygnał wyprzedzający, niska częstotliwość |

### 5.3 Dane własnych użytkowników
Rezerwacje i ceny z channel managerów zbierane od pierwszego dnia — to przyszły
zbiór treningowy dla ML (V2 demand-service) i podstawa metryk pickup.

## 6. Obsługa błędów i bezpieczniki

- **Świeżość danych rynkowych:** staty starsze niż 7 dni → flaga `stale`, silnik
  degraduje się do sezonowości bazowej (GUS + kalendarz), alert operacyjny.
- **Bezpieczeństwo cen:** twarde `min/max`, limit dziennej zmiany (%), detekcja
  anomalii przed pushem (cena poza 3σ historii → wstrzymanie i alert).
- **Sync:** pełny kalendarz albo nic; retry z backoffem; `connection.error` po
  wyczerpaniu prób.
- **Scraping:** monitoring skuteczności per rynek (odsetek udanych żądań, liczba
  ofert vs baseline); automatyczne wygaszenie rynku przy degradacji.

## 7. Testowanie

- **Golden testy silnika cen:** fixture'y rynków → oczekiwane ceny; każda zmiana
  wag/formuły widoczna w diffie.
- **Testy kontraktowe adapterów CM:** nagrane fixture'y odpowiedzi API każdego
  providera.
- **Backtesting:** replay historycznych danych scrapingu, porównanie rekomendacji
  z faktycznie zaobserwowanymi cenami zrealizowanymi na rynku.
- **Testy e2e ścieżki:** podpięcie sandboxa Beds24 → sync ofert → rekomendacja →
  push → weryfikacja kalendarza.

## 8. Fazy realizacji

1. **MVP:** scraper dla 3 rynków (Kraków, Gdańsk, Zakopane), heurystyczny
   demand_score, silnik regułowy z rozbiciem składników, adaptery Beds24 + Smoobu,
   minimalny dashboard (kalendarz cen + ustawienia).
2. **Rozszerzenie:** więcej rynków, Hostaway, polskie CM-y (Hotres, IdoSell),
   webhooks, overrides w dashboardzie.
3. **ML:** model popytu na zebranych danych, backtesting jako bramka wdrożenia,
   heurystyka jako fallback.

## 9. Stack technologiczny

Zasada: jeden język backendu (C#/.NET) — zgodny z kompetencjami zespołu; biegłość
bije teoretycznie bogatszy ekosystem. Python nie występuje w produkcji — tylko
w notebookach treningowych ML (SageMaker, punktowo), model serwowany przez ONNX
w .NET. Infrastruktura: Hetzner Cloud (~4× taniej niż AWS przy tej skali;
te same obrazy Dockera pozwalają na migrację do AWS bez zmian w kodzie).

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Serwisy backend | C# / .NET 10, ASP.NET Core minimal APIs, kontenery Linux | automatyczny OpenAPI, silne typowanie; silnik cen czytelny i testowalny |
| ORM / migracje | EF Core + migracje EF | standard .NET, obsługa jsonb przez Npgsql |
| Baza danych | PostgreSQL 16 self-hosted (dedykowana VM), osobna baza logiczna per serwis | jsonb dla `components`/`drivers`; backupy wal-g → zewnętrzny S3/B2, **odtwarzanie testowane cyklicznie** |
| Szyna zdarzeń | RabbitMQ + MassTransit | dojrzały klient .NET, fan-out + DLQ per serwis |
| Zadania cykliczne | Quartz.NET per serwis | harmonogramy scrapingu, przeliczeń, syncu |
| Scraper | Playwright for .NET + HttpClient/Polly + proxy residential | oficjalny SDK .NET; osobna VM (20 TB transferu w cenie Hetznera) |
| ML (faza 3) | trening: SageMaker punktowo (LightGBM, notebooki Python); serwowanie: ONNX Runtime w .NET | płatność tylko za godziny treningu; zero Pythona w produkcji |
| Dashboard | Next.js + TypeScript + Tailwind + shadcn/ui | interaktywny kalendarz cen; SSR dla strony marketingowej |
| Auth | klucze API + Auth.js (dashboard); sekrety: SOPS/age w repo + Docker secrets | credentials do CM szyfrowane w spoczynku |
| Object storage | S3-kompatybilny zewnętrzny: Backblaze B2 lub Cloudflare R2 | surowe zrzuty scrapingu + backupy poza Hetznerem (offsite) |
| Hosting | Hetzner Cloud, Norymberga/Falkenstein: VM app (5 kontenerów + RabbitMQ), VM Postgres, VM scraper, LB | UE/RODO, ~20–30 ms do Polski, ~€50–55/mies. |
| Deploy | Docker Compose + GitHub Actions → GHCR → `compose pull && up -d` przez SSH (opcjonalnie Coolify) | prosty, odtwarzalny; k3s dopiero gdy zaboli |
| Observability | Grafana + Prometheus + Loki (self-hosted), Sentry na błędy; każdy serwis: ASP.NET Core HealthChecks (`/health`) + Serilog (structured, sink Loki); HealthChecks UI jako dashboard zdrowia systemu | scraping i sync będą się psuć — widoczność od dnia 1 |
| Dev lokalny | `docker compose up` podnosi cały system: serwisy + Grafana/Loki + HealthChecks UI | pełne środowisko lokalne jedną komendą; parytet dev/prod |
| CI/CD | GitHub Actions, monorepo | build per katalog serwisu |

Świadome kompromisy: brak automatycznego failovera Postgresa (odtwarzanie
z backupu, przestój ~1 h — akceptowalne w MVP; replika lub migracja na RDS,
gdy pojawią się płacący klienci). Odłożone: Kubernetes, Kafka. Największy koszt
zmienny to proxy residential ($5–15/GB) — niezależny od dostawcy infrastruktury.

## 10. Skalowanie

Obciążenie rośnie liniowo z liczbą rynków (scraping) i ofert (przeliczenia) —
brak ryzyka nagłych skoków ruchu. Punkt odniesienia: 5 000 ofert × 365 dni
przeliczane codziennie ≈ 1,8 mln upsertów/dzień — w zasięgu jednej VM Postgresa.

Ścieżka skalowania (w kolejności):
1. **Wertykalnie:** resize VM-ek (Hetzner do 48 vCPU/192 GB, dalej dedyki) —
   10–20× zapasu bez żadnych zmian.
2. **Horyzontalnie:** serwisy bezstanowe za LB; scraping i pricing to konsumenci
   RabbitMQ — skalowanie = więcej kontenerów-workerów, zero zmian w kodzie.
3. **Postgres (pierwsze wąskie gardło):** partycjonowanie tabel czasowych
   (`price_recommendations`, `market_daily_stats`) po dacie → replika do
   odczytów → ewentualnie managed (RDS) przy płacących klientach.

Realny limit wzrostu to koszt proxy residential (liniowy z liczbą rynków),
nie compute. Hetzner przestaje wystarczać dopiero przy ekspansji multi-country
(setki tysięcy ofert) — wtedy k3s lub migracja na AWS z tymi samymi obrazami.

## 11. Decyzje projektowe (zapis ustaleń)

| Decyzja | Wybór |
|---|---|
| Odbiorca / kanał | Hosty przez PMS/channel managery (model PriceLabs) |
| Dane rynkowe | Własny scraping Airbnb/Booking + sygnały popytu |
| Silnik | Hybryda: reguły + demand score (docelowo ML) |
| Architektura | Mikroserwisy od początku |
| Stack | C#/.NET 10 + Hetzner (Docker, RabbitMQ, Postgres self-hosted); ML: SageMaker→ONNX; dashboard Next.js/TS |
| Zakres sesji | Spec; implementacja później na bazie planu |
