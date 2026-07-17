# Rezio

Dynamic pricing dla najmu krótkoterminowego (rynek PL).

## Szybki start (lokalnie)

    docker compose up --build

| Usługa | Adres |
|---|---|
| Pricing API | http://localhost:8080 (przykład: `/v1/listings/lst_demo/prices?from=2026-08-14&to=2026-08-16`) |
| Demand API | http://localhost:8081 (przykład: `/v1/markets/mkt_zakopane/demand?from=2026-06-04&to=2026-06-07`) |
| Scraper API | http://localhost:8082 (przykład: `POST /v1/scrape-jobs`, potem `/v1/markets/mkt_zakopane/stats?from=2026-08-01&to=2026-08-07`) |
| Channel-Sync API | http://localhost:8083 (przykład: `POST /v1/connections {"provider":"beds24"}`, potem `POST /v1/connections/{id}/sync`) |
| HealthChecks UI (zdrowie systemu) | http://localhost:8090 |
| Grafana (logi, datasource Loki) | http://localhost:3000 |
| RabbitMQ (management) | http://localhost:15672 (guest/guest) — szyna zdarzeń między serwisami |
| Postgres | localhost:5432 (rezio/rezio) — trwałe dane rynkowe pricing |

## Przepływ danych i pętla cena→push (zdarzenia)

1. `POST /v1/scrape-jobs` na scraper (:8082) z `{"market_id":"mkt_gdansk","from":"2026-06-04","to":"2026-06-10"}` → scraper publikuje `MarketStatsUpdated`, pricing zapisuje obłożenie rynku.
2. `POST /v1/markets/mkt_gdansk/publish-demand` na demand (:8081) z `{"from":"2026-06-04","to":"2026-06-10"}` → demand publikuje `DemandScoreUpdated`, pricing zapisuje demand score + drivery (np. „Boże Ciało").
3. `GET /v1/listings/lst_demo/prices?from=2026-06-04&to=2026-06-10` na pricing (:8080) → ceny liczone na danych z eventów (drivery widoczne w `components.demand_drivers`).
4. `POST /v1/connections {"provider":"beds24"}` na channel-sync (:8083), potem `POST /v1/listings/lst_demo/publish-prices` na pricing → channel-sync pushuje ceny (log `Pushed N rates` w Loki).

Bez zdarzeń pricing degraduje się do fallbacku syntetycznego (obłożenie 0.70, weekendowy demand 60).

Dane rynkowe pricing są trwałe (Postgres) — przeżywają restart kontenera. Dane starsze niż 7 dni degradują się do fallbacku syntetycznego (świeżość, spec §6). Bez `DATABASE_URL` pricing używa pamięci ulotnej.

## Development

    dotnet build && dotnet test

**Uwaga:** MassTransit jest przypięty do 8.5.10 — ostatniego wydania na licencji Apache-2.0. Wersje 9+ wymagają płatnej licencji komercyjnej do wystartowania szyny (niewidoczne w testach in-memory, fatalne przy realnym RabbitMQ). Nie aktualizuj bez świadomej decyzji licencyjnej.

Spec: `docs/superpowers/specs/`, plany: `docs/superpowers/plans/`.
