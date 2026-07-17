# Rezio

Dynamic pricing dla najmu krótkoterminowego (rynek PL).

## Szybki start (lokalnie)

    docker compose up --build

| Usługa | Adres |
|---|---|
| Pricing API | http://localhost:8080 (przykład: `/v1/listings/lst_demo/prices?from=2026-08-14&to=2026-08-16`) |
| Demand API | http://localhost:8081 (przykład: `/v1/markets/mkt_zakopane/demand?from=2026-06-04&to=2026-06-07`) |
| Scraper API | http://localhost:8082 (przykład: `POST /v1/scrape-jobs`, potem `/v1/markets/mkt_zakopane/stats?from=2026-08-01&to=2026-08-07`) |
| HealthChecks UI (zdrowie systemu) | http://localhost:8090 |
| Grafana (logi, datasource Loki) | http://localhost:3000 |

## Development

    dotnet build && dotnet test

Spec: `docs/superpowers/specs/`, plany: `docs/superpowers/plans/`.
