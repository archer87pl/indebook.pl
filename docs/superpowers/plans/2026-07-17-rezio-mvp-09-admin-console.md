# Rezio MVP — Plan 9: panel administratora (frontend serwowany przez monolit)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dać monolitowi `Rezio.Api` realny panel administratora pod `http://localhost:8080/` — wybór rynku na mapie Polski, cena bazowa i zakres dat → **prawdziwa wycena z backendu** (nowy `POST /v1/quote`) z pełnym rozbiciem na składniki i driverami popytu. Frontend statyczny (wwwroot) woła własny endpoint tego samego procesu; zero liczenia po stronie JS.

**Architecture:** Backend dostaje `QuoteService` — generalizację istniejącej ścieżki `InMemoryListingStore.MarketDaysAsync` + `PricingEngine.Recommend` na **dowolny rynek i ustawienia** (nie tylko sztywne `lst_demo`→`mkt_gdansk`). Obłożenie z `MarketDataStore` (dane scrapera) z fallbackiem 0.70; popyt liczony inline z kalendarza dla rynku wybranego na mapie. Frontend = jeden plik `wwwroot/index.html` (adaptacja istniejącej makiety-artefaktu, ale `fetch('/v1/quote')` zamiast silnika w JS), serwowany przez `UseStaticFiles` + `MapFallbackToFile`.

**Świadome ograniczenie:** kategoria i tagi obiektu są w panelu zbierane jako profil, ale NIE wpływają jeszcze na cenę (comp-set-driven pricing = przyszły plan). Cenę napędzają: rynek (→ typ/województwo → sezon, popyt, ferie), cena bazowa, daty, obłożenie. Panel jasno to komunikuje.

**Tech Stack:** .NET 10, ASP.NET Core (static files), vanilla HTML/CSS/JS (bez frameworka, bez CDN), xUnit.

## Global Constraints

- TargetFramework `net10.0`; `TreatWarningsAsErrors=true`; stan wyjściowy: 169 testów zielonych
- JSON snake_case, problem+json, limit dat `to < from || >= 365 dni` → 400 (spójnie)
- Rynki: 4 z `InMemoryMarketRegistry` (`mkt_zakopane/gdansk/krakow/warszawa`)
- Frontend: JEDEN plik `services/monolith/src/Rezio.Api/wwwroot/index.html` (inline CSS+JS), same-origin fetch, bez zewnętrznych zasobów (CSP-safe), light/dark, responsywny
- Mapowanie `Rezio.Demand.Domain.MarketType` → `Rezio.Pricing.Domain.MarketType`: po nazwie (oba enumy mają Mountains/Seaside/CityBusiness/CityTourist)
- Commit po każdym tasku; `feat:`/`chore:`

---

### Task 1: Backend `POST /v1/quote` (wycena dowolnego rynku)

**Files:**
- Create: `services/monolith/src/Rezio.Api/QuoteService.cs`
- Modify: `services/monolith/src/Rezio.Api/Contracts.cs` (rekordy request/response)
- Modify: `services/monolith/src/Rezio.Api/Program.cs` (rejestracja + endpoint)
- Test: `services/monolith/tests/Rezio.Api.Tests/QuoteEndpointTests.cs`

**Interfaces:**
- Consumes: `IMarketRegistry`, `CalendarSignals`, `DemandScoreCalculator` (demand); `IMarketDataStore`; `PricingEngine`, `ListingSettings`, `MarketDaySnapshot` (pricing)
- Produces:
  - `record QuoteDay(DateOnly Date, decimal RecommendedPrice, string? ClampedBy, double OccupancyRate, string OccupancySource, int DemandScore, QuoteComponents Components, IReadOnlyList<string> DemandDrivers)`
  - `record QuoteComponents(decimal BasePrice, double Season, double DayOfWeek, double LeadTime, double MarketOccupancy, double Demand)`
  - `class QuoteService(IMarketRegistry registry, IMarketDataStore marketData)` z `Task<IReadOnlyList<QuoteDay>?> QuoteAsync(string marketId, decimal basePrice, decimal minPrice, decimal maxPrice, DateOnly from, DateOnly to, DateOnly today, CancellationToken ct)` — `null` gdy rynek nieznany
  - `POST /v1/quote` (body `{market_id, base_price, min_price, max_price, from, to}`) → `200 QuoteResponse` | 404 | 400

- [ ] **Step 1: Failing testy (WebApplicationFactory)**

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class QuoteEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Quote_for_zakopane_over_corpus_christi_shows_holiday_driver()
    {
        var resp = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_zakopane", base_price = 450, min_price = 280, max_price = 1200,
            from = "2026-06-04", to = "2026-06-07" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("mkt_zakopane", (string)json["market_id"]!);
        Assert.Equal("Mountains", (string)json["market_type"]!);
        var days = json["days"]!.AsArray();
        Assert.Equal(4, days.Count);
        var first = days[0]!; // 2026-06-04 Boże Ciało
        Assert.True((decimal)first["recommended_price"]! > 0);
        Assert.Contains("Boże Ciało", first["demand_drivers"]!.AsArray().Select(n => (string)n!));
        Assert.NotNull(first["components"]!["season"]);
        Assert.Equal("fallback", (string)first["occupancy_source"]!); // brak scrape → fallback 0.70
    }

    [Fact]
    public async Task Unknown_market_returns_404()
    {
        var resp = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_nope", base_price = 300, min_price = 100, max_price = 900,
            from = "2026-06-04", to = "2026-06-07" });
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Inverted_range_returns_400()
    {
        var resp = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_gdansk", base_price = 300, min_price = 100, max_price = 900,
            from = "2026-06-07", to = "2026-06-04" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Business_market_ordinary_day_has_no_positive_drivers()
    {
        // Warszawa, zwykły wtorek 2026-09-08 → demand baseline 50, brak driverów
        var resp = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_warszawa", base_price = 300, min_price = 200, max_price = 650,
            from = "2026-09-08", to = "2026-09-08" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        var day = json["days"]!.AsArray()[0]!;
        Assert.Equal(50, (int)day["demand_score"]!);
        Assert.Empty(day["demand_drivers"]!.AsArray());
    }
}
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `dotnet test services/monolith/tests/Rezio.Api.Tests`
Expected: FAIL

- [ ] **Step 3: Implementacja**

`QuoteService.cs`:
```csharp
using Rezio.Demand.Domain;
using Rezio.Pricing.Domain;

namespace Rezio.Api;

public sealed record QuoteComponents(
    decimal BasePrice, double Season, double DayOfWeek, double LeadTime, double MarketOccupancy, double Demand);

public sealed record QuoteDay(
    DateOnly Date, decimal RecommendedPrice, string? ClampedBy,
    double OccupancyRate, string OccupancySource, int DemandScore,
    QuoteComponents Components, IReadOnlyList<string> DemandDrivers);

public sealed class QuoteService(IMarketRegistry registry, IMarketDataStore marketData)
{
    public async Task<IReadOnlyList<QuoteDay>?> QuoteAsync(
        string marketId, decimal basePrice, decimal minPrice, decimal maxPrice,
        DateOnly from, DateOnly to, DateOnly today, CancellationToken ct)
    {
        var market = registry.Find(marketId);
        if (market is null) return null;

        var pricingType = MapType(market.Type);
        var settings = new ListingSettings(basePrice, minPrice, maxPrice, pricingType);

        var days = new List<QuoteDay>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var data = await marketData.GetAsync(marketId, d, ct);
            var source = data.OccupancyRate is null ? "fallback" : "scraped";
            var occupancy = data.OccupancyRate ?? 0.70;

            var signals = CalendarSignals.ForRange(d, d).Single();
            var demand = DemandScoreCalculator.Score(market.Type, market.Voivodeship, signals);

            var rec = PricingEngine.Recommend(settings, new MarketDaySnapshot(d, occupancy, demand.Score, demand.Drivers), today);
            var c = rec.Components;
            days.Add(new QuoteDay(
                d, rec.RecommendedPrice, rec.ClampedBy, occupancy, source, demand.Score,
                new QuoteComponents(c.BasePrice, c.Season, c.DayOfWeek, c.LeadTime, c.MarketOccupancy, c.Demand),
                rec.Components.DemandDrivers));
        }
        return days;
    }

    private static Rezio.Pricing.Domain.MarketType MapType(Rezio.Demand.Domain.MarketType t) => t switch
    {
        Rezio.Demand.Domain.MarketType.Mountains => Rezio.Pricing.Domain.MarketType.Mountains,
        Rezio.Demand.Domain.MarketType.Seaside => Rezio.Pricing.Domain.MarketType.Seaside,
        Rezio.Demand.Domain.MarketType.CityBusiness => Rezio.Pricing.Domain.MarketType.CityBusiness,
        Rezio.Demand.Domain.MarketType.CityTourist => Rezio.Pricing.Domain.MarketType.CityTourist,
        _ => Rezio.Pricing.Domain.MarketType.CityTourist,
    };
}
```

Do `Contracts.cs`:
```csharp
public sealed record QuoteRequest(string MarketId, decimal BasePrice, decimal MinPrice, decimal MaxPrice, DateOnly From, DateOnly To);
public sealed record QuoteResponse(string MarketId, string MarketName, string MarketType, string Currency, IReadOnlyList<QuoteDay> Days);
```

W `Program.cs`: `builder.Services.AddScoped<QuoteService>();` oraz endpoint:
```csharp
app.MapPost("/v1/quote",
    async (QuoteRequest req, QuoteService quotes, IMarketRegistry registry, TimeProvider clock, CancellationToken ct) =>
{
    if (req.To < req.From || req.To.DayNumber - req.From.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var days = await quotes.QuoteAsync(req.MarketId, req.BasePrice, req.MinPrice, req.MaxPrice, req.From, req.To, today, ct);
    if (days is null)
        return Results.Problem(statusCode: 404, title: "Market not found");

    var market = registry.Find(req.MarketId)!;
    return Results.Ok(new QuoteResponse(req.MarketId, market.Name, market.Type.ToString(), "PLN", days));
});
```

- [ ] **Step 4: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS (173 = 169 + 4)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: POST /v1/quote — parameterized pricing for any market"
```

---

### Task 2: Frontend `wwwroot/index.html` + serwowanie statyczne

**Files:**
- Create: `services/monolith/src/Rezio.Api/wwwroot/index.html` (dostarczony przez kontrolera — patrz niżej; NIE przepisuj)
- Modify: `services/monolith/src/Rezio.Api/Program.cs` (`UseDefaultFiles`/`UseStaticFiles` + `MapFallbackToFile("index.html")`)
- Test: `services/monolith/tests/Rezio.Api.Tests/AdminConsoleTests.cs`

**Interfaces:**
- Consumes: `POST /v1/quote` (Task 1)
- Produces: `GET /` serwuje panel administratora (HTML); statyczne pliki z `wwwroot`

**Uwaga:** plik `wwwroot/index.html` zostanie utworzony przez kontrolera PRZED tym taskiem (duży, precyzyjny asset wołający `/v1/quote`). Implementer NIE pisze HTML — tylko dodaje serwowanie i test.

- [ ] **Step 1: Failing test**

```csharp
using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class AdminConsoleTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Root_serves_admin_console_html()
    {
        var resp = await _client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Contains("text/html", resp.Content.Headers.ContentType!.ToString());
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("Rezio", body);
        Assert.Contains("/v1/quote", body); // panel woła realny endpoint
    }
}
```

- [ ] **Step 2: Uruchom — FAIL (brak serwowania / 404 na /)**

Run: `dotnet test services/monolith/tests/Rezio.Api.Tests`
Expected: FAIL

- [ ] **Step 3: Serwowanie w `Program.cs`**

Po `var app = builder.Build();` (przed mapowaniem endpointów API, ale kolejność middleware: exception handler zostaje pierwszy):
```csharp
app.UseDefaultFiles();
app.UseStaticFiles();
```
Na końcu (po wszystkich `MapGet/MapPost`, przed `app.Run();`):
```csharp
app.MapFallbackToFile("index.html");
```
`Microsoft.AspNetCore.App` framework zawiera static files — bez dodatkowych pakietów. `wwwroot` jest domyślnie publikowany przez `dotnet publish`.

- [ ] **Step 4: Testy zielone (cała solucja) + ręczny podgląd**

Run: `dotnet test`
Expected: PASS (174). Dodatkowo: `dotnet run --project services/monolith/src/Rezio.Api`, otwórz `http://localhost:<port>/` — panel się ładuje, klik na rynek + „Wyceń" zwraca ceny z backendu.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: serve admin console from wwwroot at /"
```

---

### Task 3: Dockerfile/compose + README + e2e panelu

**Files:**
- Modify: `README.md` (adres panelu)
- (Dockerfile monolitu publikuje `wwwroot` automatycznie — tylko weryfikacja)

**Interfaces:**
- Produces: panel dostępny pod `http://localhost:8080/` w stosie Docker

- [ ] **Step 1: README**

Dodaj na górze sekcji uruchamiania: „Panel administratora: `http://localhost:8080/` — mapa, wybór rynku, cena bazowa i daty → wycena z backendu (`POST /v1/quote`)."

- [ ] **Step 2: e2e (Docker)**

`docker compose up --build -d` (Docker UP; porty jak zwykle mogą być zajęte — scratchpadowy override, nie commitować). Potem:
- otwórz/`curl` `http://localhost:8080/` → 200, HTML zawiera „Rezio" i „/v1/quote"
- `curl -X POST http://localhost:8080/v1/quote -H "Content-Type: application/json" -d '{"market_id":"mkt_zakopane","base_price":450,"min_price":280,"max_price":1200,"from":"2026-06-04","to":"2026-06-07"}'` → 200, dzień 2026-06-04 ma driver „Boże Ciało" i `recommended_price` > 0
- (opcjonalnie) w przeglądarce: wybierz Zakopane, ustaw daty na czerwiec, „Wyceń" → ceny + rozbicie + chip „Boże Ciało"
- `docker compose down`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: document admin console; verify wwwroot served in container"
```

---

## Poza zakresem (kolejne)

- Comp-set-driven pricing: kategoria/tagi realnie wpływające na obłożenie (tabela listings, agregaty comp setu) — panel już zbiera profil, backend jeszcze nie wykorzystuje
- Zapis konfiguracji obiektu (persystencja listings) + `PUT /v1/listings/{id}/comp-set`
- Auth panelu (teraz otwarty, jak reszta API)
- Trigger scrape z panelu (cross-origin do :8082) / proxy w monolicie
