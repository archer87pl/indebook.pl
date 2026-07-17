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

## Pętla cena→push (zdarzenia)

1. `POST /v1/connections {"provider":"beds24"}` na channel-sync (:8083) → zapamiętaj `id`.
2. `POST /v1/listings/lst_demo/publish-prices` na pricing (:8080) z `{"connection_id":"<id>","external_listing_id":"beds24-listing-1","from":"2026-08-01","to":"2026-08-07"}`.
3. pricing publikuje `PriceComputed` → channel-sync konsumuje i pushuje ceny (log w Grafanie: `{service="channelsync-api"}`).

## Development

    dotnet build && dotnet test

**Uwaga:** MassTransit jest przypięty do 8.5.10 — ostatniego wydania na licencji Apache-2.0. Wersje 9+ wymagają płatnej licencji komercyjnej do wystartowania szyny (niewidoczne w testach in-memory, fatalne przy realnym RabbitMQ). Nie aktualizuj bez świadomej decyzji licencyjnej.

Spec: `docs/superpowers/specs/`, plany: `docs/superpowers/plans/`.
