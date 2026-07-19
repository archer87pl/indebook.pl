# Rezio MVP — Plan 11: rynki jako dane + hardening produkcyjny

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uczynić rynki **danymi, nie kodem** — jedno źródło prawdy (`Data/markets.json`, 44 miasta z geo-koordynatami), z którego monolit ładuje katalog; frontend i scraper przestają duplikować listę rynków. Dodanie kolejnych miast to edycja pliku, nie zmiana logiki. Plus twarde elementy produkcyjne: health check bazy (readiness) i retry połączenia Npgsql.

**Architecture:** `Data/markets.json` (już utworzony przez kontrolera) → `MarketCatalog` (monolit) ładuje go na starcie, implementuje `IMarketRegistry` (`Find` + `All`) i wystawia pełne rekordy z koordynatami przez `GET /v1/markets`. Silnik cen/popytu bez zmian — typy (`MarketType`) i województwa (`Voivodeship`) to wciąż skończone enumy, seed dostarcza je jako stringi parsowane do enumów. Scraper przyjmuje dowolny `market_id` (monolit jest autorytetem rynków). Frontend pobiera `/v1/markets` i rysuje mapę (x/y z lat/lng) + listę dynamicznie.

**Świadome ograniczenie:** rynki wciąż ładowane z pliku JSON (bundlowanego), nie z Postgresa — to poprawne dla danych referencyjnych, a podmiana `MarketCatalog` (JSON) → wariant DB to zmiana jednej klasy za `IMarketRegistry`. Realne adaptery scrapingu/CM nadal poza zakresem.

**Tech Stack:** .NET 10, EF Core + Postgres, System.Text.Json, vanilla JS, xUnit.

## Global Constraints

- TargetFramework `net10.0`; `TreatWarningsAsErrors=true`; stan wyjściowy: 183 testów zielonych
- Typy/województwa bez zmian (enumy `MarketType` 4 wartości, `Voivodeship` 16)
- Seed `services/monolith/src/Rezio.Api/Data/markets.json` (44 rynki, wszystkie 16 województw) — MUSI być kopiowany do output (`CopyToOutputDirectory`)
- Wszystkie ID rynków używane w istniejących testach (`mkt_zakopane`, `mkt_gdansk`, `mkt_krakow`, `mkt_warszawa`, `mkt_karpacz`, `mkt_kolobrzeg`, `mkt_wroclaw`, `mkt_lodz`, `mkt_krynica`, `mkt_swinoujscie`, `mkt_wladyslawowo`, `mkt_poznan`, `mkt_torun`, `mkt_lublin`, `mkt_katowice`, `mkt_szczyrk`) SĄ w seedzie z tym samym typem/województwem — istniejące testy przechodzą bez zmian
- JSON API snake_case; `GET /v1/markets` zwraca `[{id, name, type, voivodeship, lat, lng}]`
- Commit po każdym tasku; `feat:`/`chore:`

---

### Task 1: `MarketCatalog` (ładuje seed) + `GET /v1/markets` + przełączenie DI

**Files:**
- Modify: `services/monolith/src/Rezio.Api/Rezio.Api.csproj` (kopiuj `Data/markets.json` do output)
- Create: `services/monolith/src/Rezio.Api/MarketCatalog.cs`
- Modify: `services/demand/src/Rezio.Demand.Domain/MarketRegistry.cs` (dodaj `All()` do `IMarketRegistry`; USUŃ `InMemoryMarketRegistry`)
- Modify: `services/monolith/src/Rezio.Api/Program.cs` (rejestracja `IMarketRegistry`→`MarketCatalog` (singleton); endpoint `GET /v1/markets`)
- Modify: `services/monolith/src/Rezio.Api/Contracts.cs` (rekord odpowiedzi)
- Test: `services/monolith/tests/Rezio.Api.Tests/MarketCatalogTests.cs`

**Interfaces:**
- Produces:
  - `IMarketRegistry` (demand domain): `Market? Find(string)` + `IReadOnlyList<Market> All()`
  - `record MarketRecord(string Id, string Name, MarketType Type, Voivodeship Voivodeship, double Lat, double Lng)` (monolit)
  - `class MarketCatalog : IMarketRegistry` — ładuje `Data/markets.json`, `Find`/`All` + `IReadOnlyList<MarketRecord> Records`
  - `GET /v1/markets` → `MarketsResponse` z listą `{id, name, type, voivodeship, lat, lng}` (snake_case)

- [ ] **Step 1: csproj — kopiuj seed do output**

W `Rezio.Api.csproj` dodaj (w `<ItemGroup>`):
```xml
<Content Include="Data\markets.json" CopyToOutputDirectory="PreserveNewest" />
```

- [ ] **Step 2: Failing testy**

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class MarketCatalogTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Markets_endpoint_returns_full_catalog_with_coords()
    {
        var resp = await _client.GetAsync("/v1/markets");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var arr = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!["markets"]!.AsArray();
        Assert.True(arr.Count >= 40);
        var first = arr[0]!;
        Assert.NotNull(first["id"]); Assert.NotNull(first["name"]);
        Assert.NotNull(first["type"]); Assert.NotNull(first["voivodeship"]);
        Assert.True((double)first["lat"]! > 48 && (double)first["lat"]! < 55); // w granicach PL
    }

    [Theory]
    [InlineData("mkt_sopot", "Seaside")]
    [InlineData("mkt_rzeszow", "CityBusiness")]
    [InlineData("mkt_szklarska", "Mountains")]
    [InlineData("mkt_zamosc", "CityTourist")]
    public async Task New_seeded_markets_are_quotable(string market, string type)
    {
        var r = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = market, base_price = 400, min_price = 200, max_price = 1200,
            from = "2026-08-01", to = "2026-08-03" });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var json = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
        Assert.Equal(type, (string)json["market_type"]!);
    }

    [Fact]
    public async Task Existing_market_id_still_works()
    {
        var r = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_zakopane", base_price = 450, min_price = 280, max_price = 1200,
            from = "2026-06-04", to = "2026-06-04" });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var json = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
        Assert.Equal("Mountains", (string)json["market_type"]!);
    }
}
```

- [ ] **Step 3: Uruchom — FAIL**

Run: `dotnet test services/monolith/tests/Rezio.Api.Tests`
Expected: FAIL — brak `/v1/markets`, nowe rynki nieznane (404)

- [ ] **Step 4: Implementacja**

`MarketRegistry.cs` (demand domain) — dodaj `All()` do interfejsu, USUŃ `InMemoryMarketRegistry` (zostaw `Market` i `IMarketRegistry`):
```csharp
namespace Rezio.Demand.Domain;

public sealed record Market(string Id, string Name, MarketType Type, Voivodeship Voivodeship);

public interface IMarketRegistry
{
    Market? Find(string marketId);
    IReadOnlyList<Market> All();
}
```

`MarketCatalog.cs` (monolit):
```csharp
using System.Text.Json;
using Rezio.Demand.Domain;

namespace Rezio.Api;

public sealed record MarketRecord(string Id, string Name, MarketType Type, Voivodeship Voivodeship, double Lat, double Lng);

public sealed class MarketCatalog : IMarketRegistry
{
    private readonly IReadOnlyList<MarketRecord> _records;
    private readonly IReadOnlyDictionary<string, Market> _byId;

    public MarketCatalog(string? path = null)
    {
        path ??= Path.Combine(AppContext.BaseDirectory, "Data", "markets.json");
        var json = File.ReadAllText(path);
        var seeds = JsonSerializer.Deserialize<List<Seed>>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        _records = seeds.Select(s => new MarketRecord(
            s.Id, s.Name, Enum.Parse<MarketType>(s.Type), Enum.Parse<Voivodeship>(s.Voivodeship), s.Lat, s.Lng)).ToList();
        _byId = _records.ToDictionary(r => r.Id, r => new Market(r.Id, r.Name, r.Type, r.Voivodeship));
    }

    public IReadOnlyList<MarketRecord> Records => _records;
    public Market? Find(string marketId) => _byId.GetValueOrDefault(marketId);
    public IReadOnlyList<Market> All() => _byId.Values.ToList();

    private sealed record Seed(string Id, string Name, string Type, string Voivodeship, double Lat, double Lng);
}
```

`Program.cs`:
- rejestracja: zamień `builder.Services.AddSingleton<IMarketRegistry, InMemoryMarketRegistry>();` na
  ```csharp
  builder.Services.AddSingleton<MarketCatalog>();
  builder.Services.AddSingleton<IMarketRegistry>(sp => sp.GetRequiredService<MarketCatalog>());
  ```
- endpoint:
  ```csharp
  app.MapGet("/v1/markets", (MarketCatalog catalog) =>
      Results.Ok(new MarketsResponse(catalog.Records
          .Select(r => new MarketDto(r.Id, r.Name, r.Type.ToString(), r.Voivodeship.ToString(), r.Lat, r.Lng)).ToList())));
  ```

`Contracts.cs`:
```csharp
public sealed record MarketDto(string Id, string Name, string Type, string Voivodeship, double Lat, double Lng);
public sealed record MarketsResponse(IReadOnlyList<MarketDto> Markets);
```

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS (istniejące + nowe; usunięcie `InMemoryMarketRegistry` nie psuje niczego — DI używa `MarketCatalog`)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: load markets from seed catalog; GET /v1/markets"
```

---

### Task 2: Scraper przyjmuje dowolny rynek (koniec zaszytej listy)

**Files:**
- Modify: `services/scraper/src/Rezio.Scraper.Domain/SyntheticListingSource.cs` (generuj dla dowolnego niepustego `market_id`)
- Modify: `services/scraper/src/Rezio.Scraper.Api/Program.cs` (usuń `knownMarkets` gate)
- Modify: `services/scraper/tests/Rezio.Scraper.Domain.Tests/SyntheticListingSourceTests.cs` i/lub `Rezio.Scraper.Api.Tests/ScraperEndpointTests.cs` (dostosuj testy „unknown market")

**Interfaces:**
- Produces: scraper scrapuje dowolny `market_id` (monolit jest autorytetem rynków); pusty/whitespace `market_id` → pusto

- [ ] **Step 1: Zmień zachowanie**

`SyntheticListingSource.cs` — zamiast `if (!KnownMarkets.Contains(marketId)) return empty;` daj `if (string.IsNullOrWhiteSpace(marketId)) return empty;`; usuń pole `KnownMarkets`. Generuj 30 ofert dla każdego niepustego `market_id`.
`Program.cs` scrapera — usuń tablicę `knownMarkets` i walidację 404 dla nieznanego rynku; `POST /v1/scrape-jobs` akceptuje dowolny niepusty `market_id` (walidacja zakresu dat zostaje).

- [ ] **Step 2: Dostosuj testy**

- Test `Unknown_market_returns_empty` (SyntheticListingSourceTests) → zamień na `Empty_market_id_returns_empty` (pusty string → 0 ofert) oraz `Any_market_id_returns_30` (dowolny id np. „mkt_cokolwiek" → 30).
- Test `Scrape_job_for_unknown_market_returns_404` (ScraperEndpointTests) → zamień na `Scrape_job_accepts_any_market` (dowolny id → 200, `listings_scraped: 30`). Zakres-400 test zostaje.
- Testy w monolicie (`ScrapeAndPublishTests` — jeśli asertują „unknown → 0”) dostosuj analogicznie do nowej semantyki.

- [ ] **Step 3: Build + testy zielone**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: scraper accepts any market id (monolith is the market authority)"
```

---

### Task 3: Frontend pobiera rynki z `/v1/markets` (dynamiczna mapa i lista)

**Files:**
- Modify: `services/monolith/src/Rezio.Api/wwwroot/index.html` (dostarczony przez kontrolera — fetch `/v1/markets`, x/y z lat/lng, dynamiczne piny i lista)
- Modify: `docs/ARCHITECTURE.md`, `README.md` (rynki jako dane, 44 miasta)

**Interfaces:**
- Consumes: `GET /v1/markets`
- Produces: panel bez zaszytej listy rynków — buduje mapę i listę z odpowiedzi API

**Uwaga:** `wwwroot/index.html` aktualizuje KONTROLER przed tym taskiem. Implementer: weryfikuje suite, docker e2e, docs.

- [ ] **Step 1: Suite zielone**

Run: `dotnet test`
Expected: PASS (smoke `GET /` bez zmian). Frontend ładuje rynki dynamicznie po stronie klienta — testy backendu nietknięte.

- [ ] **Step 2: Docs**

`docs/ARCHITECTURE.md` i `README.md`: rynki są danymi (`Data/markets.json`, 44 miasta, wszystkie 16 województw); dodanie kolejnych = edycja pliku, nie kodu. `GET /v1/markets` jako źródło dla panelu.

- [ ] **Step 3: e2e (Docker)**

`docker compose up --build -d` (porty jak zwykle — override w scratchpadzie, nie commitować; plik `compose.ports-override.yml` może już istnieć niescommitowany — użyj go). Zweryfikuj:
- `GET /v1/markets` → ≥40 rynków, każdy z `lat`/`lng`
- `GET /` → panel serwuje HTML; w przeglądarce mapa/lista wypełniają się z API (nowe miasta: Sopot, Rzeszów, Szklarska Poręba widoczne)
- `POST /v1/quote mkt_szklarska 2026-02-09..2026-02-11` → Mountains, driver „ferie zimowe (dolnośląskie)"
- `POST /v1/quote mkt_sopot 2026-08-01..2026-08-03` → Seaside, wysoki sezon
- `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: admin console loads markets dynamically; docs for markets-as-data"
```

---

### Task 4: Hardening produkcyjny (health check bazy + retry Npgsql)

**Files:**
- Modify: `services/monolith/src/Rezio.Api/Program.cs` (Npgsql `EnableRetryOnFailure`; `AddDbContextCheck` w gałęzi Postgres)
- Modify: `services/monolith/src/Rezio.Api/Rezio.Api.csproj` (pakiet `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore` jeśli potrzebny)
- Test: `services/monolith/tests/Rezio.Api.Tests/HealthEndpointTests.cs` (dopisz — /health nadal 200 w trybie in-memory)

**Interfaces:**
- Produces: odporność połączenia (retry transientów) + readiness bazy w `/health` (gdy Postgres)

- [ ] **Step 1: Retry + health check**

W gałęzi `if (StoreSelection.UsesPostgres(databaseUrl))` w `Program.cs`:
```csharp
builder.Services.AddDbContext<PricingDbContext>(o =>
    o.UseNpgsql(databaseUrl, npg => npg.EnableRetryOnFailure()));
```
oraz do `AddHealthChecks()` (po rejestracji DbContext, w tej samej gałęzi):
```csharp
builder.Services.AddHealthChecks().AddDbContextCheck<PricingDbContext>("postgres");
```
(pakiet: `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore`, najnowszy stabilny na net10 — odnotuj wersję).

Uwaga: w trybie in-memory (brak `DATABASE_URL`) health check bazy NIE jest dodawany — `/health` zwraca Healthy jak dotąd.

- [ ] **Step 2: Test — /health w trybie in-memory**

Dopisz do istniejących testów potwierdzenie, że bez `DATABASE_URL` `/health` → 200 `Healthy` (WebApplicationFactory nie ustawia `DATABASE_URL`, więc gałąź Postgres/health-check się nie aktywuje). Jeśli `HealthEndpointTests` już to pokrywa — zostaw, tylko potwierdź zielone.

- [ ] **Step 3: Build + testy zielone**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 4: e2e (Docker) — readiness bazy**

`docker compose up --build -d`; `GET /health` (przez override port) → `Healthy`, a w JSON healthchecku pojawia się wpis `postgres` ze stanem Healthy (baza gotowa). `docker compose down`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Npgsql retry-on-failure and Postgres readiness health check"
```

---

## Poza zakresem (kolejne)

- Rynki w Postgresie (tabela `markets`, edytowalne przez ops bez redeployu) — dziś JSON bundlowany
- Realny slippy-map w panelu z prawdziwą projekcją geo (mamy już lat/lng)
- Realne adaptery scrapingu/CM, tabela `listings`, auth, harmonogram (Quartz.NET)
- Nowy typ rynku „jeziora/Mazury” (osobna krzywa sezonowa/wagi)
