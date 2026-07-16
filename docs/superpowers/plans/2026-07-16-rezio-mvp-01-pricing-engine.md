# Rezio MVP — Plan 1: Fundament monorepo + silnik cen (pricing-service)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo .NET z działającym silnikiem wyceny (mnożniki + rozbicie na składniki + clamping) wystawionym przez endpoint `GET /v1/listings/{id}/prices` na danych in-memory.

**Architecture:** Czysta logika domenowa w `Rezio.Pricing.Domain` (funkcje statyczne, bez I/O), minimal API w `Rezio.Pricing.Api` z in-memory store (Postgres/RabbitMQ dojdą w kolejnych planach). Silnik: `cena = base × sezon × dzień_tygodnia × lead_time × obłożenie × popyt`, zaokrąglenie do pełnych PLN, potem clamp [min,max].

**Tech Stack:** .NET 10, C#, ASP.NET Core minimal APIs, xUnit, Microsoft.AspNetCore.Mvc.Testing, Serilog (+ sink Loki), ASP.NET Core HealthChecks, Docker Compose (z Grafana/Loki/HealthChecks UI), GitHub Actions.

## Global Constraints

- TargetFramework: `net10.0`; `Nullable=enable`, `ImplicitUsings=enable`, `TreatWarningsAsErrors=true` (w `Directory.Build.props`)
- Testy: xUnit; komenda: `dotnet test`
- JSON w API: snake_case (`JsonNamingPolicy.SnakeCaseLower`), błędy jako problem+json (`AddProblemDetails`)
- Pieniądze: `decimal`, waluta PLN, zaokrąglanie do pełnych złotych `MidpointRounding.AwayFromZero`
- Daty: `DateOnly`; "dziś" zawsze z wstrzykniętego `TimeProvider` (nigdy `DateTime.Now` w logice)
- Układ monorepo: `services/pricing/src/*`, `services/pricing/tests/*`; solution `Rezio.sln` w korzeniu
- Commit po każdym tasku; komunikaty `feat:`/`chore:`/`test:`

---

### Task 1: Scaffold monorepo i solution

**Files:**
- Create: `Rezio.sln`, `Directory.Build.props`, `.gitignore`
- Create (szablonami): `services/pricing/src/Rezio.Pricing.Domain/`, `services/pricing/src/Rezio.Pricing.Api/`, `services/pricing/tests/Rezio.Pricing.Domain.Tests/`, `services/pricing/tests/Rezio.Pricing.Api.Tests/`

**Interfaces:**
- Consumes: nic
- Produces: budowalna solucja; projekty testowe zreferowane do źródeł; kolejne taski dopisują pliki do tych projektów

- [ ] **Step 1: Utwórz projekty i solution**

```bash
dotnet new gitignore
dotnet new sln -n Rezio
dotnet new classlib -n Rezio.Pricing.Domain -o services/pricing/src/Rezio.Pricing.Domain
dotnet new web      -n Rezio.Pricing.Api    -o services/pricing/src/Rezio.Pricing.Api
dotnet new xunit    -n Rezio.Pricing.Domain.Tests -o services/pricing/tests/Rezio.Pricing.Domain.Tests
dotnet new xunit    -n Rezio.Pricing.Api.Tests    -o services/pricing/tests/Rezio.Pricing.Api.Tests
dotnet sln Rezio.sln add services/pricing/src/Rezio.Pricing.Domain services/pricing/src/Rezio.Pricing.Api services/pricing/tests/Rezio.Pricing.Domain.Tests services/pricing/tests/Rezio.Pricing.Api.Tests
dotnet add services/pricing/src/Rezio.Pricing.Api reference services/pricing/src/Rezio.Pricing.Domain
dotnet add services/pricing/tests/Rezio.Pricing.Domain.Tests reference services/pricing/src/Rezio.Pricing.Domain
dotnet add services/pricing/tests/Rezio.Pricing.Api.Tests reference services/pricing/src/Rezio.Pricing.Api
dotnet add services/pricing/tests/Rezio.Pricing.Api.Tests package Microsoft.AspNetCore.Mvc.Testing
```

- [ ] **Step 2: Dodaj `Directory.Build.props` w korzeniu**

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
</Project>
```

- [ ] **Step 3: Usuń pliki-szablony `Class1.cs` (Domain) — zostaw `UnitTest1.cs` jako smoke test**

- [ ] **Step 4: Zbuduj i odpal testy**

Run: `dotnet build && dotnet test`
Expected: build OK, 2 testy (puste `UnitTest1`) PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with pricing service skeleton"
```

---

### Task 2: Mnożniki kalendarzowe — dzień tygodnia, sezon, lead time

**Files:**
- Create: `services/pricing/src/Rezio.Pricing.Domain/MarketType.cs`
- Create: `services/pricing/src/Rezio.Pricing.Domain/Factors/DayOfWeekFactor.cs`
- Create: `services/pricing/src/Rezio.Pricing.Domain/Factors/SeasonFactor.cs`
- Create: `services/pricing/src/Rezio.Pricing.Domain/Factors/LeadTimeFactor.cs`
- Test: `services/pricing/tests/Rezio.Pricing.Domain.Tests/CalendarFactorsTests.cs`
- Delete: `services/pricing/tests/Rezio.Pricing.Domain.Tests/UnitTest1.cs`

**Interfaces:**
- Consumes: nic
- Produces: `enum MarketType { Mountains, Seaside, CityBusiness, CityTourist }`; `double DayOfWeekFactor.For(DateOnly)`; `double SeasonFactor.For(MarketType, DateOnly)`; `double LeadTimeFactor.For(int daysAhead)`

- [ ] **Step 1: Napisz failing testy**

```csharp
using Rezio.Pricing.Domain;
using Rezio.Pricing.Domain.Factors;

namespace Rezio.Pricing.Domain.Tests;

public class CalendarFactorsTests
{
    [Theory]
    [InlineData("2026-08-14", 1.15)] // piątek
    [InlineData("2026-08-15", 1.15)] // sobota
    [InlineData("2026-08-16", 1.00)] // niedziela
    [InlineData("2026-08-17", 1.00)] // poniedziałek
    public void DayOfWeek_uplift_for_friday_and_saturday(string date, double expected) =>
        Assert.Equal(expected, DayOfWeekFactor.For(DateOnly.Parse(date)));

    [Theory]
    [InlineData(MarketType.Seaside,      "2026-08-01", 1.35)]
    [InlineData(MarketType.Seaside,      "2026-11-01", 0.75)]
    [InlineData(MarketType.Mountains,    "2026-01-15", 1.25)]
    [InlineData(MarketType.Mountains,    "2026-11-15", 0.85)]
    [InlineData(MarketType.CityBusiness, "2026-07-15", 0.90)]
    [InlineData(MarketType.CityTourist,  "2026-07-15", 1.15)]
    public void Season_curve_per_market_type(MarketType type, string date, double expected) =>
        Assert.Equal(expected, SeasonFactor.For(type, DateOnly.Parse(date)));

    [Theory]
    [InlineData(-1, 1.00)]  // data przeszła — neutralnie
    [InlineData(0, 0.90)]
    [InlineData(3, 0.90)]
    [InlineData(4, 0.95)]
    [InlineData(7, 0.95)]
    [InlineData(30, 1.00)]
    [InlineData(90, 1.00)]
    [InlineData(91, 1.05)]
    public void LeadTime_bands(int daysAhead, double expected) =>
        Assert.Equal(expected, LeadTimeFactor.For(daysAhead));
}
```

- [ ] **Step 2: Uruchom — mają failować kompilacją**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Domain.Tests`
Expected: FAIL — brak typów `MarketType`, `DayOfWeekFactor`, …

- [ ] **Step 3: Implementacja**

`MarketType.cs`:
```csharp
namespace Rezio.Pricing.Domain;

public enum MarketType { Mountains, Seaside, CityBusiness, CityTourist }
```

`Factors/DayOfWeekFactor.cs`:
```csharp
namespace Rezio.Pricing.Domain.Factors;

public static class DayOfWeekFactor
{
    public static double For(DateOnly date) => date.DayOfWeek switch
    {
        DayOfWeek.Friday or DayOfWeek.Saturday => 1.15,
        _ => 1.00
    };
}
```

`Factors/SeasonFactor.cs`:
```csharp
namespace Rezio.Pricing.Domain.Factors;

public static class SeasonFactor
{
    // Indeks 0 = styczeń … 11 = grudzień
    private static readonly IReadOnlyDictionary<MarketType, double[]> Curves =
        new Dictionary<MarketType, double[]>
        {
            [MarketType.Mountains]    = [1.25, 1.20, 0.95, 0.85, 0.90, 1.00, 1.15, 1.15, 0.95, 0.90, 0.85, 1.10],
            [MarketType.Seaside]      = [0.75, 0.75, 0.80, 0.90, 1.00, 1.15, 1.35, 1.35, 1.00, 0.85, 0.75, 0.80],
            [MarketType.CityBusiness] = [0.95, 1.00, 1.05, 1.05, 1.05, 1.00, 0.90, 0.90, 1.05, 1.05, 1.00, 0.95],
            [MarketType.CityTourist]  = [0.85, 0.85, 0.95, 1.05, 1.10, 1.10, 1.15, 1.15, 1.05, 1.00, 0.90, 1.05],
        };

    public static double For(MarketType marketType, DateOnly date) => Curves[marketType][date.Month - 1];
}
```

`Factors/LeadTimeFactor.cs`:
```csharp
namespace Rezio.Pricing.Domain.Factors;

public static class LeadTimeFactor
{
    public static double For(int daysAhead) => daysAhead switch
    {
        < 0 => 1.00,
        <= 3 => 0.90,
        <= 7 => 0.95,
        <= 90 => 1.00,
        _ => 1.05
    };
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Domain.Tests`
Expected: PASS (18 testów)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: calendar pricing factors (day-of-week, season, lead time)"
```

---

### Task 3: Mnożniki rynkowe — obłożenie i popyt

**Files:**
- Create: `services/pricing/src/Rezio.Pricing.Domain/Factors/OccupancyFactor.cs`
- Create: `services/pricing/src/Rezio.Pricing.Domain/Factors/DemandFactor.cs`
- Test: `services/pricing/tests/Rezio.Pricing.Domain.Tests/MarketFactorsTests.cs`

**Interfaces:**
- Consumes: nic
- Produces: `double OccupancyFactor.For(double occupancyRate)` (0..1); `double DemandFactor.For(int demandScore)` (0..100 → 0.75..1.25)

- [ ] **Step 1: Failing testy**

```csharp
using Rezio.Pricing.Domain.Factors;

namespace Rezio.Pricing.Domain.Tests;

public class MarketFactorsTests
{
    [Theory]
    [InlineData(0.90, 1.15)]
    [InlineData(0.85, 1.15)]
    [InlineData(0.70, 1.10)]
    [InlineData(0.50, 1.00)]
    [InlineData(0.30, 0.95)]
    [InlineData(0.10, 0.90)]
    public void Occupancy_bands(double rate, double expected) =>
        Assert.Equal(expected, OccupancyFactor.For(rate));

    [Theory]
    [InlineData(0, 0.75)]
    [InlineData(50, 1.00)]
    [InlineData(80, 1.15)]
    [InlineData(100, 1.25)]
    public void Demand_maps_linearly(int score, double expected) =>
        Assert.Equal(expected, DemandFactor.For(score), precision: 10);
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Domain.Tests`
Expected: FAIL — brak `OccupancyFactor`, `DemandFactor`

- [ ] **Step 3: Implementacja**

`Factors/OccupancyFactor.cs`:
```csharp
namespace Rezio.Pricing.Domain.Factors;

public static class OccupancyFactor
{
    public static double For(double occupancyRate) => occupancyRate switch
    {
        >= 0.85 => 1.15,
        >= 0.70 => 1.10,
        >= 0.50 => 1.00,
        >= 0.30 => 0.95,
        _ => 0.90
    };
}
```

`Factors/DemandFactor.cs`:
```csharp
namespace Rezio.Pricing.Domain.Factors;

public static class DemandFactor
{
    // 0 → 0.75, 50 → 1.00, 100 → 1.25
    public static double For(int demandScore) => 1.0 + (demandScore - 50) / 200.0;
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Domain.Tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: market pricing factors (occupancy, demand score)"
```

---

### Task 4: PricingEngine — złożenie, zaokrąglenie, clamp, rozbicie składników

**Files:**
- Create: `services/pricing/src/Rezio.Pricing.Domain/ListingSettings.cs`
- Create: `services/pricing/src/Rezio.Pricing.Domain/MarketDaySnapshot.cs`
- Create: `services/pricing/src/Rezio.Pricing.Domain/PriceRecommendation.cs`
- Create: `services/pricing/src/Rezio.Pricing.Domain/PricingEngine.cs`
- Test: `services/pricing/tests/Rezio.Pricing.Domain.Tests/PricingEngineTests.cs`

**Interfaces:**
- Consumes: wszystkie mnożniki z Tasków 2–3 (sygnatury jak wyżej)
- Produces:
  - `record ListingSettings(decimal BasePrice, decimal MinPrice, decimal MaxPrice, MarketType MarketType)`
  - `record MarketDaySnapshot(DateOnly Date, double OccupancyRate, int DemandScore, IReadOnlyList<string> DemandDrivers)`
  - `record PriceComponents(decimal BasePrice, double Season, double DayOfWeek, double LeadTime, double MarketOccupancy, double Demand, IReadOnlyList<string> DemandDrivers)`
  - `record PriceRecommendation(DateOnly Date, decimal RecommendedPrice, PriceComponents Components, string? ClampedBy)`
  - `PriceRecommendation PricingEngine.Recommend(ListingSettings, MarketDaySnapshot, DateOnly today)`

- [ ] **Step 1: Failing golden testy (wartości policzone ręcznie)**

```csharp
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Domain.Tests;

public class PricingEngineTests
{
    // Bałtyk, sobota 15.08, wysoki popyt: 350 × 1.35 × 1.15 × 1.00 × 1.15 × 1.15 = 718.61 → 719
    [Fact]
    public void Seaside_summer_saturday_high_demand()
    {
        var settings = new ListingSettings(350m, 200m, 800m, MarketType.Seaside);
        var day = new MarketDaySnapshot(new DateOnly(2026, 8, 15), 0.90, 80, ["długi weekend 15.08"]);

        var rec = PricingEngine.Recommend(settings, day, today: new DateOnly(2026, 7, 16));

        Assert.Equal(719m, rec.RecommendedPrice);
        Assert.Null(rec.ClampedBy);
        Assert.Equal(1.35, rec.Components.Season);
        Assert.Equal(1.15, rec.Components.DayOfWeek);
        Assert.Equal(1.00, rec.Components.LeadTime);
        Assert.Equal(1.15, rec.Components.MarketOccupancy);
        Assert.Equal(1.15, rec.Components.Demand, precision: 10);
        Assert.Equal(new[] { "długi weekend 15.08" }, rec.Components.DemandDrivers);
    }

    // Góry, poniedziałek w listopadzie, last-minute, martwo: 300 × 0.85 × 1.00 × 0.90 × 0.90 × 0.90 = 185.90 → 186 → clamp do 280
    [Fact]
    public void Low_season_clamps_to_min_price()
    {
        var settings = new ListingSettings(300m, 280m, 900m, MarketType.Mountains);
        var day = new MarketDaySnapshot(new DateOnly(2026, 11, 16), 0.25, 30, []);

        var rec = PricingEngine.Recommend(settings, day, today: new DateOnly(2026, 11, 14));

        Assert.Equal(280m, rec.RecommendedPrice);
        Assert.Equal("min_price", rec.ClampedBy);
    }

    // Miasto turystyczne, szczyt: 700 × 1.15 × 1.15 × 1.00 × 1.15 × 1.25 = 1330.77 → 1331 → clamp do 850
    [Fact]
    public void Peak_demand_clamps_to_max_price()
    {
        var settings = new ListingSettings(700m, 300m, 850m, MarketType.CityTourist);
        var day = new MarketDaySnapshot(new DateOnly(2026, 7, 25), 0.90, 100, ["koncert, Tauron Arena"]); // sobota

        var rec = PricingEngine.Recommend(settings, day, today: new DateOnly(2026, 7, 15));

        Assert.Equal(850m, rec.RecommendedPrice);
        Assert.Equal("max_price", rec.ClampedBy);
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Domain.Tests`
Expected: FAIL — brak `ListingSettings`, `PricingEngine`, …

- [ ] **Step 3: Implementacja**

`ListingSettings.cs`:
```csharp
namespace Rezio.Pricing.Domain;

public sealed record ListingSettings(
    decimal BasePrice,
    decimal MinPrice,
    decimal MaxPrice,
    MarketType MarketType);
```

`MarketDaySnapshot.cs`:
```csharp
namespace Rezio.Pricing.Domain;

public sealed record MarketDaySnapshot(
    DateOnly Date,
    double OccupancyRate,
    int DemandScore,
    IReadOnlyList<string> DemandDrivers);
```

`PriceRecommendation.cs`:
```csharp
namespace Rezio.Pricing.Domain;

public sealed record PriceComponents(
    decimal BasePrice,
    double Season,
    double DayOfWeek,
    double LeadTime,
    double MarketOccupancy,
    double Demand,
    IReadOnlyList<string> DemandDrivers);

public sealed record PriceRecommendation(
    DateOnly Date,
    decimal RecommendedPrice,
    PriceComponents Components,
    string? ClampedBy);
```

`PricingEngine.cs`:
```csharp
using Rezio.Pricing.Domain.Factors;

namespace Rezio.Pricing.Domain;

public static class PricingEngine
{
    public static PriceRecommendation Recommend(
        ListingSettings settings, MarketDaySnapshot day, DateOnly today)
    {
        var season = SeasonFactor.For(settings.MarketType, day.Date);
        var dayOfWeek = DayOfWeekFactor.For(day.Date);
        var leadTime = LeadTimeFactor.For(day.Date.DayNumber - today.DayNumber);
        var occupancy = OccupancyFactor.For(day.OccupancyRate);
        var demand = DemandFactor.For(day.DemandScore);

        var multiplier = season * dayOfWeek * leadTime * occupancy * demand;
        var price = Math.Round(settings.BasePrice * (decimal)multiplier, 0, MidpointRounding.AwayFromZero);

        string? clampedBy = null;
        if (price < settings.MinPrice) { price = settings.MinPrice; clampedBy = "min_price"; }
        else if (price > settings.MaxPrice) { price = settings.MaxPrice; clampedBy = "max_price"; }

        return new PriceRecommendation(
            day.Date,
            price,
            new PriceComponents(settings.BasePrice, season, dayOfWeek, leadTime, occupancy, demand, day.DemandDrivers),
            clampedBy);
    }
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Domain.Tests`
Expected: PASS (wszystkie, łącznie z Taskami 2–3)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pricing engine with component breakdown and min/max clamping"
```

---

### Task 5: Endpoint `GET /v1/listings/{id}/prices` z in-memory store

**Files:**
- Create: `services/pricing/src/Rezio.Pricing.Api/IListingStore.cs`
- Create: `services/pricing/src/Rezio.Pricing.Api/InMemoryListingStore.cs`
- Create: `services/pricing/src/Rezio.Pricing.Api/Contracts.cs`
- Modify: `services/pricing/src/Rezio.Pricing.Api/Program.cs` (całość poniżej)
- Test: `services/pricing/tests/Rezio.Pricing.Api.Tests/PricesEndpointTests.cs`
- Delete: `services/pricing/tests/Rezio.Pricing.Api.Tests/UnitTest1.cs`

**Interfaces:**
- Consumes: `PricingEngine.Recommend(ListingSettings, MarketDaySnapshot, DateOnly)` z Task 4
- Produces: HTTP API — `200 PricesResponse(string ListingId, string Currency, IReadOnlyList<PriceRecommendation> Prices)` w snake_case; `404`/`400` problem+json; seed: oferta `lst_demo` (Seaside, base 350, min 200, max 800)

- [ ] **Step 1: Failing testy integracyjne**

```csharp
using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Pricing.Api.Tests;

public class PricesEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Known_listing_returns_prices_with_component_breakdown()
    {
        var from = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(10);
        var to = from.AddDays(6);

        var resp = await _client.GetAsync($"/v1/listings/lst_demo/prices?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("lst_demo", (string)json["listing_id"]!);
        Assert.Equal("PLN", (string)json["currency"]!);
        var prices = json["prices"]!.AsArray();
        Assert.Equal(7, prices.Count);
        var first = prices[0]!;
        Assert.True((decimal)first["recommended_price"]! > 0);
        Assert.NotNull(first["components"]!["season"]);
        Assert.NotNull(first["components"]!["day_of_week"]);
        Assert.NotNull(first["components"]!["market_occupancy"]);
    }

    [Fact]
    public async Task Unknown_listing_returns_404_problem_json()
    {
        var resp = await _client.GetAsync("/v1/listings/lst_nope/prices?from=2026-08-01&to=2026-08-07");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Inverted_range_returns_400()
    {
        var resp = await _client.GetAsync("/v1/listings/lst_demo/prices?from=2026-08-07&to=2026-08-01");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Range_over_365_days_returns_400()
    {
        var resp = await _client.GetAsync("/v1/listings/lst_demo/prices?from=2026-01-01&to=2027-06-01");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Api.Tests`
Expected: FAIL (endpoint nie istnieje / brak partial `Program`)

- [ ] **Step 3: Implementacja**

`IListingStore.cs`:
```csharp
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public interface IListingStore
{
    ListingSettings? FindSettings(string listingId);
    IReadOnlyList<MarketDaySnapshot> MarketDays(string listingId, DateOnly from, DateOnly to);
}
```

`InMemoryListingStore.cs`:
```csharp
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public sealed class InMemoryListingStore : IListingStore
{
    private static readonly ListingSettings Demo = new(350m, 200m, 800m, MarketType.Seaside);

    public ListingSettings? FindSettings(string listingId) =>
        listingId == "lst_demo" ? Demo : null;

    public IReadOnlyList<MarketDaySnapshot> MarketDays(string listingId, DateOnly from, DateOnly to)
    {
        var days = new List<MarketDaySnapshot>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var weekend = d.DayOfWeek is DayOfWeek.Friday or DayOfWeek.Saturday;
            days.Add(new MarketDaySnapshot(d, 0.70, weekend ? 60 : 50, weekend ? ["weekend"] : []));
        }
        return days;
    }
}
```

`Contracts.cs`:
```csharp
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public sealed record PricesResponse(
    string ListingId,
    string Currency,
    IReadOnlyList<PriceRecommendation> Prices);
```

`Program.cs` (całość):
```csharp
using System.Text.Json;
using Rezio.Pricing.Api;
using Rezio.Pricing.Domain;

var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IListingStore, InMemoryListingStore>();

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();

app.MapGet("/v1/listings/{id}/prices",
    (string id, DateOnly from, DateOnly to, IListingStore store, TimeProvider clock) =>
{
    if (to < from || to.DayNumber - from.DayNumber > 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var settings = store.FindSettings(id);
    if (settings is null)
        return Results.Problem(statusCode: 404, title: "Listing not found");

    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var prices = store.MarketDays(id, from, to)
        .Select(day => PricingEngine.Recommend(settings, day, today))
        .ToList();

    return Results.Ok(new PricesResponse(id, "PLN", prices));
});

app.Run();

public partial class Program;
```

- [ ] **Step 4: Testy zielone (całość solucji)**

Run: `dotnet test`
Expected: PASS — Domain + Api

- [ ] **Step 5: Smoke ręczny**

Run: `dotnet run --project services/pricing/src/Rezio.Pricing.Api` i w drugim terminalu:
`curl "http://localhost:5000/v1/listings/lst_demo/prices?from=2026-08-14&to=2026-08-16"`
Expected: JSON z 3 cenami, pola snake_case, weekend droższy niż niedziela

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: prices endpoint with in-memory listing store"
```

---

### Task 6: Healthcheck `/health` i logowanie strukturalne (Serilog)

**Files:**
- Modify: `services/pricing/src/Rezio.Pricing.Api/Program.cs` (całość poniżej)
- Test: `services/pricing/tests/Rezio.Pricing.Api.Tests/HealthEndpointTests.cs`

**Interfaces:**
- Consumes: `Program.cs` z Task 5
- Produces: `GET /health` → 200 + JSON `{"status":"Healthy",…}` (format HealthChecks UI); logi strukturalne na konsolę zawsze, do Loki gdy ustawiona zmienna środowiskowa `LOKI_URL`

- [ ] **Step 1: Dodaj pakiety**

```bash
dotnet add services/pricing/src/Rezio.Pricing.Api package Serilog.AspNetCore
dotnet add services/pricing/src/Rezio.Pricing.Api package Serilog.Sinks.Grafana.Loki
dotnet add services/pricing/src/Rezio.Pricing.Api package AspNetCore.HealthChecks.UI.Client
```

- [ ] **Step 2: Failing test**

```csharp
using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Pricing.Api.Tests;

public class HealthEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Health_returns_healthy_status_json()
    {
        var resp = await _client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("Healthy", (string)json["status"]!);
    }
}
```

- [ ] **Step 3: Uruchom — FAIL (404 na /health)**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Api.Tests`
Expected: FAIL — `Health_returns_healthy_status_json`

- [ ] **Step 4: Implementacja — `Program.cs` (całość)**

```csharp
using System.Text.Json;
using HealthChecks.UI.Client;
using Rezio.Pricing.Api;
using Rezio.Pricing.Domain;
using Serilog;
using Serilog.Sinks.Grafana.Loki;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSerilog(lc =>
{
    lc.MinimumLevel.Information()
      .Enrich.FromLogContext()
      .WriteTo.Console();
    var lokiUrl = builder.Configuration["LOKI_URL"];
    if (!string.IsNullOrWhiteSpace(lokiUrl))
        lc.WriteTo.GrafanaLoki(lokiUrl,
            labels: [new LokiLabel { Key = "service", Value = "pricing-api" }]);
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IListingStore, InMemoryListingStore>();

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

app.MapGet("/v1/listings/{id}/prices",
    (string id, DateOnly from, DateOnly to, IListingStore store, TimeProvider clock) =>
{
    if (to < from || to.DayNumber - from.DayNumber > 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var settings = store.FindSettings(id);
    if (settings is null)
        return Results.Problem(statusCode: 404, title: "Listing not found");

    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var prices = store.MarketDays(id, from, to)
        .Select(day => PricingEngine.Recommend(settings, day, today))
        .ToList();

    return Results.Ok(new PricesResponse(id, "PLN", prices));
});

app.Run();

public partial class Program;
```

- [ ] **Step 5: Testy zielone (całość)**

Run: `dotnet test`
Expected: PASS — w tym nowy test `/health`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: health endpoint and structured logging with optional Loki sink"
```

---

### Task 7: Docker Compose ze stosem monitoringu, CI, README

**Files:**
- Create: `services/pricing/Dockerfile`
- Create: `docker-compose.yml`
- Create: `infra/grafana/provisioning/datasources/loki.yml`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: publikowalny projekt `Rezio.Pricing.Api` z `/health` i sinkiem Loki (Task 6)
- Produces: `docker compose up` podnosi cały lokalny system: API `:8080`, Grafana (logi) `:3000`, HealthChecks UI (dashboard zdrowia) `:8090`, Loki `:3100`; CI na push/PR

- [ ] **Step 1: `services/pricing/Dockerfile`**

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish services/pricing/src/Rezio.Pricing.Api -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Rezio.Pricing.Api.dll"]
```

- [ ] **Step 2: `docker-compose.yml` — system + monitoring**

```yaml
services:
  pricing-api:
    build:
      context: .
      dockerfile: services/pricing/Dockerfile
    ports:
      - "8080:8080"
    environment:
      LOKI_URL: http://loki:3100
    depends_on:
      - loki

  loki:
    image: grafana/loki:3.1.0
    ports:
      - "3100:3100"

  grafana:
    image: grafana/grafana:11.1.0
    ports:
      - "3000:3000"
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
    volumes:
      - ./infra/grafana/provisioning:/etc/grafana/provisioning
    depends_on:
      - loki

  healthchecks-ui:
    image: xabarilcoding/healthchecksui:5.0.0
    ports:
      - "8090:80"
    environment:
      HealthChecksUI__HealthChecks__0__Name: pricing-api
      HealthChecksUI__HealthChecks__0__Uri: http://pricing-api:8080/health
    depends_on:
      - pricing-api
```

- [ ] **Step 3: Provisioning datasource'a Loki — `infra/grafana/provisioning/datasources/loki.yml`**

```yaml
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: true
```

- [ ] **Step 4: Odpal cały system lokalnie i zweryfikuj**

Run: `docker compose up --build -d`, potem:
- `curl "http://localhost:8080/v1/listings/lst_demo/prices?from=2026-08-14&to=2026-08-16"` → 200 + JSON
- `curl http://localhost:8080/health` → `{"status":"Healthy",…}`
- przeglądarka `http://localhost:8090` → HealthChecks UI pokazuje pricing-api jako Healthy
- przeglądarka `http://localhost:3000` → Grafana → Explore → Loki → zapytanie `{service="pricing-api"}` pokazuje logi requestów

Na koniec: `docker compose down`

- [ ] **Step 5: `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
  pull_request:
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: 10.0.x
      - run: dotnet build --configuration Release
      - run: dotnet test --configuration Release --no-build --verbosity normal
```

- [ ] **Step 6: `README.md`**

```markdown
# Rezio

Dynamic pricing dla najmu krótkoterminowego (rynek PL).

## Szybki start (lokalnie)

    docker compose up --build

| Usługa | Adres |
|---|---|
| Pricing API | http://localhost:8080 (przykład: `/v1/listings/lst_demo/prices?from=2026-08-14&to=2026-08-16`) |
| HealthChecks UI (zdrowie systemu) | http://localhost:8090 |
| Grafana (logi, datasource Loki) | http://localhost:3000 |

## Development

    dotnet build && dotnet test

Spec: `docs/superpowers/specs/`, plany: `docs/superpowers/plans/`.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: local compose stack with Grafana/Loki/HealthChecks UI, CI, README"
```

---

## Poza zakresem tego planu (kolejne plany)

- Postgres/EF Core (store trwały zamiast in-memory), RabbitMQ/MassTransit i zdarzenia `price.updated`
- demand-service (heurystyka świąt/ferii/eventów) — teraz `DemandScore` przychodzi w snapshotcie
- market-scraper, channel-sync (Beds24/Smoobu), api-gateway (auth), dashboard
- Reguły usera (weekend uplift własny, orphan gap), limit dziennej zmiany ceny, overrides
- Comp sets i segmentacja (kategoria/tagi/pojemność) — w tym planie `MarketDaySnapshot`
  reprezentuje agregaty otoczenia obiektu; w planie scrapera te agregaty zaczną
  pochodzić z comp setu obiektu zamiast z całego rynku (silnik bez zmian)
