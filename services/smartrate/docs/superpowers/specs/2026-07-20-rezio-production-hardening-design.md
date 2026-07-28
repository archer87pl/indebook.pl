# Rezio — wyjście na produkcję: zabezpieczenie endpointów i wdrożenie

Data: 2026-07-20
Status: zaakceptowany projekt, do rozpisania na plan implementacji

## Cel

Wystawić Rezio pod publicznym adresem HTTPS jako **demo dostępne wyłącznie dla
administratora**. Żaden endpoint nie może być osiągalny anonimowo poza jawnie
wymienionymi wyjątkami, a fakt ten musi być weryfikowany automatycznie w CI —
nie jednorazowym przeglądem kodu.

Celem wdrożenia jest Hetzner, ale **każdy krok musi dać się uruchomić i sprawdzić
lokalnie** na tej samej konfiguracji, która pojedzie na serwer.

## Stan wyjściowy (2026-07-20, master @ 3dce2e8)

Modularny monolit `Rezio.Api` (:8080, moduły pricing + demand + channel-sync)
oraz osobny `Rezio.Scraper.Api` (:8082). 191 zielonych testów. Dane rynkowe
trwałe w Postgresie, 44 rynki ładowane z `Data/markets.json`.

Bezpieczeństwo: **zerowe**. Przegląd kodu potwierdza brak `Authentication`,
`Authorization`, `RateLimit` i `UseHttpsRedirection` w całym repozytorium.

Otwarte powierzchnie:

| Powierzchnia | Problem |
|---|---|
| `Rezio.Api` :8080 | 11 endpointów `/v1/*` anonimowych; `MapFallbackToFile` serwuje panel każdemu |
| `Rezio.Scraper.Api` :8082 | `POST /v1/scrape-jobs`, `GET /v1/markets/{id}/stats` anonimowe |
| `POST /v1/internal/market-stats` | ingest maszyna–maszyna bez żadnego uwierzytelnienia (znany dług z planu 8) |
| `grafana` :3000 | `GF_AUTH_ANONYMOUS_ENABLED=true` z rolą **Admin** — pełny odczyt logów i edycja źródeł danych |
| `postgres` :5432 | port wystawiony na hosta, hasło `rezio/rezio` wprost w `docker-compose.yml` |
| `healthchecks-ui` :8090, `loki` :3100 | wystawione publicznie |
| `GET /health` | zwraca pełną odpowiedź HealthChecks UI — ujawnia stan i nazwy komponentów infrastruktury |

## Model bezpieczeństwa

Jedna tożsamość: administrator. Hasło nigdy nie trafia do repozytorium — w
środowisku znajduje się wyłącznie hash (`ADMIN_PASSWORD_HASH`, PBKDF2 przez
wbudowany `PasswordHasher<T>` z ASP.NET Core Identity, bez zaciągania całego
Identity).

Trzy strefy:

**Strefa 1 — panel i API (cookie sesji).**
Ciasteczko `HttpOnly`, `Secure`, `SameSite=Strict`, wystawiane przez
`POST /login` po weryfikacji hasła. Obejmuje: `/`, `/v1/quote`, `/v1/markets`,
`/v1/markets/{id}/demand`, `/v1/listings/{id}/prices`,
`/v1/listings/{id}/publish-prices`, `/v1/connections`, `/v1/connections/{id}`,
`/v1/connections/{id}/listings`, `/v1/connections/{id}/sync`.
Panel jest tego samego pochodzenia co API, więc `fetch` niesie ciasteczko bez
zmian w JS poza obsługą odpowiedzi 401 (przekierowanie na `/login`).

**Strefa 2 — maszyna–maszyna (klucz API).**
`POST /v1/internal/market-stats` wymaga nagłówka `X-Api-Key` zgodnego z
`INTERNAL_API_KEY`. Porównanie w czasie stałym. Scraper wstrzykuje ten sam
sekret w swoim `HttpClient` (`ScrapeAndPublish`). Ciasteczko admina **nie**
uprawnia do tej strefy, a klucz API nie uprawnia do strefy 1.

**Strefa 3 — anonimowa, jawnie okrojona.**
`GET /health` — odchudzony do samego statusu `Healthy`/`Unhealthy` bez nazw i
szczegółów komponentów. Pełna odpowiedź HealthChecks UI przenosi się na
`GET /health/details`, chroniony ciasteczkiem admina (strefa 1) — oglądasz go w
przeglądarce po zalogowaniu.
`GET /login` i `POST /login` oraz zasoby statyczne potrzebne stronie logowania.

Kontener `healthchecks-ui` **wypada z konfiguracji produkcyjnej**: nie potrafi
uwierzytelnić się ciasteczkiem admina, a dokładanie trzeciej ścieżki
uwierzytelnienia wyłącznie dla panelu zdrowia nie jest tego warte przy jednym
użytkowniku. Zostaje w compose deweloperskim, gdzie odpytuje anonimowy
`/health` — status `Healthy`/`Unhealthy` per usługa w zupełności wystarcza do
zielono-czerwonego pulpitu, a szczegóły i tak obejrzysz na `/health/details` po
zalogowaniu. Na produkcji tę rolę pełni `/health/details` w przeglądarce oraz
healthcheck Dockera.

Scraper przestaje być wystawiany na zewnątrz: traci mapowanie portu i żyje
wyłącznie w sieci Dockera. Zadania scrape'u uruchamia się przez
`docker compose exec`. To domyka dług odnotowany w ledgerze planu 8.

## Dowód pokrycia — test-strażnik

Dopisanie `RequireAuthorization()` w jedenastu miejscach jest jednorazową
starannością, nie gwarancją. Złamie ją dwunasty endpoint dodany za pół roku.

Dlatego rdzeniem projektu jest test przechodzący po `EndpointDataSource`
uruchomionej aplikacji, który dla **każdego** zarejestrowanego endpointu żąda
albo obecności metadanych autoryzacji, albo obecności na jawnej liście wyjątków
zapisanej wprost w teście. Nowy niezabezpieczony endpoint powoduje czerwone CI,
a jego dopuszczenie wymaga świadomej edycji listy wyjątków.

Uzupełniająco, testy czarnoskrzynkowe w istniejącym harnessie
`WebApplicationFactory` (projekt `Rezio.Api.Tests`):

- każdy endpoint strefy 1 bez ciasteczka → 401
- `/v1/internal/market-stats` bez klucza i z błędnym kluczem → 401
- `/v1/internal/market-stats` z poprawnym kluczem → 202
- poprawne hasło na `/login` → ciasteczko z atrybutami `HttpOnly`, `Secure`, `SameSite=Strict`
- błędne hasło → 401 bez ciasteczka
- `/health` anonimowo → 200 bez nazw komponentów w treści

Istniejące 191 testów wołających `/v1/*` przechodzi na uwierzytelnionego klienta
przez wspólny helper w fixture, żeby zmiana nie rozlała się na każdy plik testowy.

## Zamknięcie powierzchni w compose

- `grafana`: anonimowy dostęp wyłączony, hasło administratora z `.env`
- `postgres`: bez mapowania portu na hosta, hasło z `.env`
- `loki`, `scraper-api`: bez portów na hoście, tylko sieć wewnętrzna
- `healthchecks-ui`: usunięty z konfiguracji produkcyjnej, zostaje w deweloperskiej
- na zewnątrz wystawiony **wyłącznie Caddy** (80/443), proxy do `rezio-api`
- sekrety w `.env` (już w `.gitignore`), wzorzec w wersjonowanym `.env.example`

W aplikacji dodatkowo: `AddRateLimiter` na `/v1/*` oraz ostrzejszy limit na
`/login` (ochrona przed zgadywaniem hasła), HSTS.

## Jeden artefakt, dwa środowiska

Jeden `compose.prod.yml` i jeden `Caddyfile`; różnica wyłącznie w zmiennych
środowiskowych.

- lokalnie: `SITE_ADDRESS=https://rezio.localhost` — Caddy wystawia certyfikat z
  własnego wewnętrznego CA
- Hetzner: `SITE_ADDRESS=rezio.<domena>` — ten sam plik bierze certyfikat z
  Let's Encrypt

Dzięki temu lokalnie testowana jest **dokładnie ta sama ścieżka HTTPS + cookie
`Secure`**, która pojedzie na produkcję. Eliminuje to klasyczną awarię „lokalnie
po HTTP działało, na produkcji ciasteczko `Secure` przestało się zapisywać".

Efekt uboczny: monolit przestaje wystawiać port na hosta, więc znikają
odnotowane konflikty lokalne (8080 zajmowany przez MiniTool MTAgentService,
8090 przez lokalny nginx).

## Faza zerowa — blokująca

Repozytorium nie ma remote'a, `gh` nie jest zalogowany, więc
`.github/workflows/ci.yml` nigdy się nie wykonał. Test-strażnik jest wart tyle,
ile CI, które go uruchamia. Założenie repozytorium na GitHubie i zielony przebieg
CI poprzedza jakąkolwiek pracę nad uwierzytelnieniem.

## Kolejność faz

0. GitHub remote, zielone CI na masterze
1. Uwierzytelnienie: `/login`, cookie, `X-Api-Key`, migracja testów
2. Test-strażnik pokrycia + testy 401
3. Hardening: rate limiting, HSTS, odchudzony `/health`, sekrety w `.env`, zamknięcie portów w compose
4. `compose.prod.yml` + `Caddyfile`, weryfikacja lokalna na `https://rezio.localhost`
5. Hetzner: serwer, domena, DNS, deploy, backup Postgresa z próbą odtworzenia

## Poza zakresem (świadomie)

Multi-tenancy, rejestracja użytkowników, billing, realne adaptery
Beds24/Smoobu/Hostaway, prawdziwy scraping Airbnb/Booking, scheduler cyklicznych
zadań, RODO i regulamin. Wszystko to staje się konieczne dopiero przy obcych
użytkownikach i prawdziwych danych; celem jest demo dla jednego administratora.

Sztywny `lst_demo` w `InMemoryListingStore` zostaje bez zmian — panel działa
przez `POST /v1/quote`, który obsługuje wszystkie 44 rynki.

## Ryzyka

- **Migracja 191 testów na uwierzytelnionego klienta** to największa mechaniczna
  część pracy. Ograniczana przez jeden helper w fixture zamiast zmian per plik.
- **Cookie `Secure` wymaga HTTPS**, więc testy integracyjne przez
  `WebApplicationFactory` (HTTP) muszą mieć to uwzględnione w konfiguracji
  ciasteczka dla środowiska testowego — bez osłabiania produkcji.
- **Caddy z wewnętrznym CA** wymaga zaufania certyfikatowi w przeglądarce przy
  pierwszym uruchomieniu lokalnym; alternatywnie akceptacja ostrzeżenia.
