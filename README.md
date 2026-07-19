# Rezio

Dynamic pricing dla najmu krótkoterminowego (rynek PL).

## Architektura

Modularny monolit `rezio-api` (:8080) — moduły pricing, demand i channel-sync w jednym procesie, wywołania między nimi in-process (bez szyny zdarzeń), dane rynkowe trwałe w Postgresie. Osobny serwis `scraper-api` (:8082), który POST-uje zescrape'owane statystyki rynku do monolitu przez HTTP. Bez RabbitMQ/MassTransit.

## Szybki start (lokalnie)

Panel administratora: `http://localhost:8080/` — mapa, wybór rynku, cena bazowa i daty → wycena z backendu (`POST /v1/quote`). Mapa i lista rynków budowane są dynamicznie z `GET /v1/markets` (bez zakodowanej listy w JS). System pokrywa 44 polskie rynki (data-driven, `Data/markets.json`) w 4 typach (góry / morze / miasto turystyczne / miasto biznesowe), we wszystkich 16 województwach.

    docker compose up --build

| Usługa | Adres |
|---|---|
| Rezio API (pricing + demand + channel-sync) | http://localhost:8080 (przykłady: `/v1/listings/lst_demo/prices?from=2026-08-14&to=2026-08-16`, `/v1/markets/mkt_zakopane/demand?from=2026-06-04&to=2026-06-07`, `POST /v1/connections {"provider":"beds24"}`) |
| Scraper API | http://localhost:8082 (przykład: `POST /v1/scrape-jobs {"market_id":"mkt_gdansk","from":"2026-06-01","to":"2026-06-10"}` — POST-uje wynik do `rezio-api`) |
| HealthChecks UI (zdrowie systemu) | http://localhost:8090 |
| Grafana (logi, datasource Loki) | http://localhost:3000 |
| Postgres | localhost:5432 (rezio/rezio) — trwałe dane rynkowe |

## Przepływ danych i pętla cena→push

1. `POST /v1/scrape-jobs` na scraper (:8082) z `{"market_id":"mkt_gdansk","from":"2026-06-01","to":"2026-06-10"}` → scraper POST-uje wynik na `rezio-api` `/v1/internal/market-stats`, monolit zapisuje obłożenie rynku.
2. `GET /v1/listings/lst_demo/prices?from=...&to=...` na rezio-api (:8080) → ceny liczone na bieżąco: obłożenie z zapisanych statystyk rynku, demand score liczony in-process (moduł demand, drivery np. „Boże Ciało" widoczne w `components.demand_drivers`, bez publikowania zdarzeń).
3. `POST /v1/connections {"provider":"beds24"}` na rezio-api, potem `POST /v1/listings/lst_demo/publish-prices` → moduł channel-sync pushuje ceny in-process (log `Pushed N rates` w Loki, `{service="rezio-api"}`).

Bez danych ze scrape'a pricing degraduje się do fallbacku syntetycznego (obłożenie 0.70, weekendowy demand 60).

Dane rynkowe są trwałe (Postgres) — przeżywają restart kontenera. Dane starsze niż 7 dni degradują się do fallbacku syntetycznego (świeżość, spec §6). Bez `DATABASE_URL` monolit używa pamięci ulotnej.

## Development

    dotnet build && dotnet test

Spec: `docs/superpowers/specs/`, plany: `docs/superpowers/plans/`.
