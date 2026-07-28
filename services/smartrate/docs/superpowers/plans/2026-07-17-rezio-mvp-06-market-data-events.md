# Rezio MVP — Plan 6: dane rynkowe zdarzeniami (scraper/demand → pricing)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Domknąć przepływ danych architektury: scraper publikuje `MarketStatsUpdated` po scrapie, demand publikuje `DemandScoreUpdated` na żądanie, a pricing konsumuje oba zdarzenia do `MarketDataStore` i liczy ceny na danych z eventów — z **degradacją do dotychczasowego fallbacku syntetycznego**, gdy danych brak (spec §6: bezpieczna degradacja przy braku/nieświeżości danych).

**Architecture:** Dwa nowe rekordy zdarzeń w `Rezio.Contracts`. Scraper: `ScrapeAndPublish` (orkiestracja: istniejący `ScrapeRunner` → odczyt agregatów ze store → publish). Demand: `DemandPublisher` + endpoint `POST /v1/markets/{id}/publish-demand` (lustrzany do publish-prices z planu 5). Pricing: `MarketDataStore` (in-memory, merge obłożenia i demand score per rynek+data) + dwa konsumery + refaktor `InMemoryListingStore` (oferta dostaje `MarketId`; snapshot dnia czyta ze store z fallbackiem do obecnych wartości syntetycznych — zachowanie bez eventów NIE zmienia się, więc istniejące testy przechodzą bez modyfikacji oczekiwań).

**Tech Stack:** .NET 10, C#, MassTransit **8.5.10** (przypięty — v9+ wymaga płatnej licencji; NIE podnosić wersji), xUnit + MassTransit test harness, Docker Compose (RabbitMQ już w stosie).

## Global Constraints

- TargetFramework: `net10.0`; `TreatWarningsAsErrors=true`; stan wyjściowy: 151 testów zielonych
- MassTransit DOKŁADNIE `8.5.10` (i `MassTransit.RabbitMQ` 8.5.10) — pin licencyjny; akcesor harnessu w v8: `harness.Published.Select<T>().First().Context.Message`
- Nowe rekordy zdarzeń w namespace dokładnie `Rezio.Contracts`
- Transport switch identyczny jak w pricing/channel-sync: `RABBITMQ_URL` obecne → `UsingRabbitMq(Host(new Uri(url)) + ConfigureEndpoints)`, brak → `UsingInMemory(ConfigureEndpoints)`
- Determinizm testów: harness in-memory, zero realnego brokera, zero `Task.Delay`
- JSON API: snake_case, problem+json; limit zakresu dat `to < from || to.DayNumber - from.DayNumber >= 365` → 400
- Fallback pricing (wiążące — zachowanie identyczne z obecnym, gdy brak danych z eventów): `OccupancyRate = 0.70`; `DemandScore = 60` i drivers `["weekend"]` dla piątku/soboty, w przeciwnym razie `50` i `[]`
- Oferta `lst_demo` przypisana do rynku `mkt_gdansk` (Seaside — spójnie z jej MarketType)
- Commit po każdym tasku; komunikaty `feat:`/`chore:`/`test:`

---

### Task 1: Kontrakty `MarketStatsUpdated` i `DemandScoreUpdated`

**Files:**
- Create: `contracts/Rezio.Contracts/MarketStatsUpdated.cs`
- Create: `contracts/Rezio.Contracts/DemandScoreUpdated.cs`
- Test: `contracts/Rezio.Contracts.Tests/MarketDataEventsTests.cs`

**Interfaces:**
- Consumes: nic
- Produces (namespace `Rezio.Contracts`):
  - `record MarketStatsLine(DateOnly Date, decimal MedianPrice, double OccupancyRate, int ActiveListings)`
  - `record MarketStatsUpdated(string MarketId, IReadOnlyList<MarketStatsLine> Stats)`
  - `record DemandScoreLine(DateOnly Date, int Score, IReadOnlyList<string> Drivers)`
  - `record DemandScoreUpdated(string MarketId, IReadOnlyList<DemandScoreLine> Scores)`

- [ ] **Step 1: Failing test**

```csharp
using Rezio.Contracts;

namespace Rezio.Contracts.Tests;

public class MarketDataEventsTests
{
    [Fact]
    public void Namespaces_are_exactly_Rezio_Contracts()
    {
        Assert.Equal("Rezio.Contracts", typeof(MarketStatsUpdated).Namespace);
        Assert.Equal("Rezio.Contracts", typeof(DemandScoreUpdated).Namespace);
        Assert.Equal("Rezio.Contracts", typeof(MarketStatsLine).Namespace);
        Assert.Equal("Rezio.Contracts", typeof(DemandScoreLine).Namespace);
    }

    [Fact]
    public void Market_stats_updated_carries_daily_lines()
    {
        var evt = new MarketStatsUpdated("mkt_gdansk",
            [new MarketStatsLine(new DateOnly(2026, 6, 4), 320m, 0.85, 30)]);
        Assert.Single(evt.Stats);
        Assert.Equal(0.85, evt.Stats[0].OccupancyRate);
    }

    [Fact]
    public void Demand_score_updated_carries_scores_with_drivers()
    {
        var evt = new DemandScoreUpdated("mkt_gdansk",
            [new DemandScoreLine(new DateOnly(2026, 6, 4), 70, ["Boże Ciało", "długi weekend"])]);
        Assert.Equal(70, evt.Scores[0].Score);
        Assert.Contains("Boże Ciało", evt.Scores[0].Drivers);
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test contracts/Rezio.Contracts.Tests`
Expected: FAIL

- [ ] **Step 3: Implementacja**

`MarketStatsUpdated.cs`:
```csharp
namespace Rezio.Contracts;

public sealed record MarketStatsLine(DateOnly Date, decimal MedianPrice, double OccupancyRate, int ActiveListings);

public sealed record MarketStatsUpdated(string MarketId, IReadOnlyList<MarketStatsLine> Stats);
```

`DemandScoreUpdated.cs`:
```csharp
namespace Rezio.Contracts;

public sealed record DemandScoreLine(DateOnly Date, int Score, IReadOnlyList<string> Drivers);

public sealed record DemandScoreUpdated(string MarketId, IReadOnlyList<DemandScoreLine> Scores);
```

- [ ] **Step 4: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS (154 = 151 + 3)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: MarketStatsUpdated and DemandScoreUpdated event contracts"
```

---

### Task 2: scraper publikuje `MarketStatsUpdated` po scrapie

**Files:**
- Create: `services/scraper/src/Rezio.Scraper.Api/ScrapeAndPublish.cs`
- Modify: `services/scraper/src/Rezio.Scraper.Api/Program.cs` (MassTransit + rejestracja + endpoint używa ScrapeAndPublish)
- Modify: `services/scraper/src/Rezio.Scraper.Api/Rezio.Scraper.Api.csproj` (ref Contracts + MassTransit 8.5.10 + MassTransit.RabbitMQ 8.5.10)
- Modify: `services/scraper/tests/Rezio.Scraper.Api.Tests/Rezio.Scraper.Api.Tests.csproj` (MassTransit 8.5.10)
- Test: `services/scraper/tests/Rezio.Scraper.Api.Tests/ScrapeAndPublishTests.cs`

**Interfaces:**
- Consumes: `ScrapeRunner`, `IStatsStore`, `SyntheticListingSource`, `MarketDailyStats` (plan 3); `MarketStatsUpdated`/`MarketStatsLine` (Task 1); `IPublishEndpoint`
- Produces: `class ScrapeAndPublish(ScrapeRunner runner, IStatsStore store, IPublishEndpoint bus)` z `Task<ScrapeResult> RunAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)` — deleguje do runnera; gdy `DaysAggregated > 0`, czyta agregaty ze store i publikuje `MarketStatsUpdated`; endpoint `POST /v1/scrape-jobs` przechodzi na `ScrapeAndPublish` (kontrakt HTTP bez zmian)

- [ ] **Step 1: Referencja + pakiety**

```bash
dotnet add services/scraper/src/Rezio.Scraper.Api reference contracts/Rezio.Contracts
dotnet add services/scraper/src/Rezio.Scraper.Api package MassTransit --version 8.5.10
dotnet add services/scraper/src/Rezio.Scraper.Api package MassTransit.RabbitMQ --version 8.5.10
dotnet add services/scraper/tests/Rezio.Scraper.Api.Tests package MassTransit --version 8.5.10
```

- [ ] **Step 2: Failing testy (harness)**

```csharp
using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.Contracts;
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api.Tests;

public class ScrapeAndPublishTests
{
    private static ServiceProvider Build() => new ServiceCollection()
        .AddSingleton<IListingSource, SyntheticListingSource>()
        .AddSingleton<IStatsStore, InMemoryStatsStore>()
        .AddSingleton<ScrapeRunner>()
        .AddScoped<ScrapeAndPublish>()
        .AddMassTransitTestHarness()
        .BuildServiceProvider(true);

    [Fact]
    public async Task Publishes_market_stats_after_successful_scrape()
    {
        await using var provider = Build();
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var sut = scope.ServiceProvider.GetRequiredService<ScrapeAndPublish>();
            var result = await sut.RunAsync("mkt_gdansk",
                new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 10), CancellationToken.None);

            Assert.Equal(7, result.DaysAggregated);
            Assert.True(await harness.Published.Any<MarketStatsUpdated>());

            var evt = harness.Published.Select<MarketStatsUpdated>().First().Context.Message;
            Assert.Equal("mkt_gdansk", evt.MarketId);
            Assert.Equal(7, evt.Stats.Count);
            Assert.All(evt.Stats, s => Assert.InRange(s.OccupancyRate, 0.0, 1.0));
            Assert.All(evt.Stats, s => Assert.True(s.MedianPrice > 0));
        }
        finally { await harness.Stop(); }
    }

    [Fact]
    public async Task Unknown_market_publishes_nothing()
    {
        await using var provider = Build();
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var sut = scope.ServiceProvider.GetRequiredService<ScrapeAndPublish>();
            var result = await sut.RunAsync("mkt_nope",
                new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 10), CancellationToken.None);

            Assert.Equal(0, result.DaysAggregated);
            Assert.False(await harness.Published.Any<MarketStatsUpdated>());
        }
        finally { await harness.Stop(); }
    }
}
```

- [ ] **Step 3: Uruchom — FAIL kompilacją**

Run: `dotnet test services/scraper/tests/Rezio.Scraper.Api.Tests`
Expected: FAIL

- [ ] **Step 4: Implementacja**

`ScrapeAndPublish.cs`:
```csharp
using MassTransit;
using Rezio.Contracts;
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api;

public sealed class ScrapeAndPublish(ScrapeRunner runner, IStatsStore store, IPublishEndpoint bus)
{
    public async Task<ScrapeResult> RunAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var result = await runner.RunAsync(marketId, from, to, ct);
        if (result.DaysAggregated > 0)
        {
            var stats = store.Get(marketId, from, to)
                .Select(s => new MarketStatsLine(s.Date, s.MedianPrice, s.OccupancyRate, s.ActiveListings))
                .ToList();
            await bus.Publish(new MarketStatsUpdated(marketId, stats), ct);
        }
        return result;
    }
}
```

W `Program.cs`: dodaj `using MassTransit;`, rejestrację (przed `builder.Build()`):
```csharp
builder.Services.AddScoped<ScrapeAndPublish>();
builder.Services.AddMassTransit(x =>
{
    var rabbit = builder.Configuration["RABBITMQ_URL"];
    if (!string.IsNullOrWhiteSpace(rabbit))
        x.UsingRabbitMq((ctx, cfg) => { cfg.Host(new Uri(rabbit)); cfg.ConfigureEndpoints(ctx); });
    else
        x.UsingInMemory((ctx, cfg) => cfg.ConfigureEndpoints(ctx));
});
```
Endpoint `POST /v1/scrape-jobs`: zamień wstrzykiwany `ScrapeRunner runner` na `ScrapeAndPublish runner` (wywołanie `runner.RunAsync(...)` bez zmian — ten sam kształt wyniku i kontrakt HTTP).

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scraper publishes MarketStatsUpdated after scrape"
```

---

### Task 3: demand publikuje `DemandScoreUpdated` (`POST /v1/markets/{id}/publish-demand`)

**Files:**
- Create: `services/demand/src/Rezio.Demand.Api/DemandPublisher.cs`
- Modify: `services/demand/src/Rezio.Demand.Api/Program.cs` (MassTransit + rejestracja + endpoint)
- Modify: `services/demand/src/Rezio.Demand.Api/Contracts.cs` (rekordy request/response)
- Modify: `services/demand/src/Rezio.Demand.Api/Rezio.Demand.Api.csproj` (ref Contracts + pakiety 8.5.10)
- Modify: `services/demand/tests/Rezio.Demand.Api.Tests/Rezio.Demand.Api.Tests.csproj` (MassTransit 8.5.10)
- Test: `services/demand/tests/Rezio.Demand.Api.Tests/DemandPublisherTests.cs`
- Test: `services/demand/tests/Rezio.Demand.Api.Tests/PublishDemandEndpointTests.cs`

**Interfaces:**
- Consumes: `IMarketRegistry`, `CalendarSignals`, `DemandScoreCalculator` (plan 2); `DemandScoreUpdated`/`DemandScoreLine` (Task 1); `IPublishEndpoint`
- Produces:
  - `class DemandPublisher(IMarketRegistry registry, IPublishEndpoint bus)` z `Task<int> PublishAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)` — nieznany rynek → 0 bez publikacji; inaczej liczy score'y istniejącym pipeline'em i publikuje, zwraca liczbę dni
  - Endpoint `POST /v1/markets/{id}/publish-demand` (body `{from,to}`) → `202 {published_days}` | 404 | 400
  - `record PublishDemandRequest(DateOnly From, DateOnly To)`, `record PublishDemandResponse(int PublishedDays)` w Contracts.cs

- [ ] **Step 1: Referencja + pakiety**

```bash
dotnet add services/demand/src/Rezio.Demand.Api reference contracts/Rezio.Contracts
dotnet add services/demand/src/Rezio.Demand.Api package MassTransit --version 8.5.10
dotnet add services/demand/src/Rezio.Demand.Api package MassTransit.RabbitMQ --version 8.5.10
dotnet add services/demand/tests/Rezio.Demand.Api.Tests package MassTransit --version 8.5.10
```

- [ ] **Step 2: Failing testy — harness**

```csharp
using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.Contracts;

namespace Rezio.Demand.Api.Tests;

public class DemandPublisherTests
{
    private static ServiceProvider Build() => new ServiceCollection()
        .AddSingleton<IMarketRegistry, InMemoryMarketRegistry>()
        .AddScoped<DemandPublisher>()
        .AddMassTransitTestHarness()
        .BuildServiceProvider(true);

    [Fact]
    public async Task Publishes_scores_with_holiday_drivers_for_known_market()
    {
        await using var provider = Build();
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var sut = scope.ServiceProvider.GetRequiredService<DemandPublisher>();
            var days = await sut.PublishAsync("mkt_zakopane",
                new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 7), CancellationToken.None);

            Assert.Equal(4, days);
            Assert.True(await harness.Published.Any<DemandScoreUpdated>());

            var evt = harness.Published.Select<DemandScoreUpdated>().First().Context.Message;
            Assert.Equal("mkt_zakopane", evt.MarketId);
            Assert.Equal(4, evt.Scores.Count);
            Assert.Equal(75, evt.Scores[0].Score); // Boże Ciało w długi weekend, góry
            Assert.Contains("Boże Ciało", evt.Scores[0].Drivers);
        }
        finally { await harness.Stop(); }
    }

    [Fact]
    public async Task Unknown_market_publishes_nothing()
    {
        await using var provider = Build();
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var sut = scope.ServiceProvider.GetRequiredService<DemandPublisher>();
            var days = await sut.PublishAsync("mkt_nope",
                new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 7), CancellationToken.None);

            Assert.Equal(0, days);
            Assert.False(await harness.Published.Any<DemandScoreUpdated>());
        }
        finally { await harness.Stop(); }
    }
}
```

- [ ] **Step 3: Failing testy — HTTP**

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Demand.Api.Tests;

public class PublishDemandEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Known_market_returns_202_with_published_days()
    {
        var resp = await _client.PostAsJsonAsync("/v1/markets/mkt_zakopane/publish-demand",
            new { from = "2026-06-04", to = "2026-06-07" });
        Assert.Equal(HttpStatusCode.Accepted, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal(4, (int)json["published_days"]!);
    }

    [Fact]
    public async Task Unknown_market_returns_404()
    {
        var resp = await _client.PostAsJsonAsync("/v1/markets/mkt_nope/publish-demand",
            new { from = "2026-06-04", to = "2026-06-07" });
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Inverted_range_returns_400()
    {
        var resp = await _client.PostAsJsonAsync("/v1/markets/mkt_zakopane/publish-demand",
            new { from = "2026-06-07", to = "2026-06-04" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
```

- [ ] **Step 4: Uruchom — FAIL**

Run: `dotnet test services/demand/tests/Rezio.Demand.Api.Tests`
Expected: FAIL

- [ ] **Step 5: Implementacja**

`DemandPublisher.cs`:
```csharp
using MassTransit;
using Rezio.Contracts;
using Rezio.Demand.Domain;

namespace Rezio.Demand.Api;

public sealed class DemandPublisher(IMarketRegistry registry, IPublishEndpoint bus)
{
    public async Task<int> PublishAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var market = registry.Find(marketId);
        if (market is null)
            return 0;

        var scores = CalendarSignals.ForRange(from, to)
            .Select(signals => DemandScoreCalculator.Score(market.Type, market.Voivodeship, signals))
            .Select(score => new DemandScoreLine(score.Date, score.Score, score.Drivers))
            .ToList();

        await bus.Publish(new DemandScoreUpdated(marketId, scores), ct);
        return scores.Count;
    }
}
```

Do `Contracts.cs` dopisz:
```csharp
public sealed record PublishDemandRequest(DateOnly From, DateOnly To);
public sealed record PublishDemandResponse(int PublishedDays);
```

W `Program.cs`: `using MassTransit;`, rejestracja (blok transport-switch identyczny jak w scraperze) + `builder.Services.AddScoped<DemandPublisher>();` oraz endpoint:
```csharp
app.MapPost("/v1/markets/{id}/publish-demand",
    async (string id, PublishDemandRequest request, DemandPublisher publisher, CancellationToken ct) =>
{
    if (request.To < request.From || request.To.DayNumber - request.From.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var days = await publisher.PublishAsync(id, request.From, request.To, ct);
    return days == 0
        ? Results.Problem(statusCode: 404, title: "Market not found")
        : Results.Accepted($"/v1/markets/{id}/demand", new PublishDemandResponse(days));
});
```

- [ ] **Step 6: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: demand publishes DemandScoreUpdated via publish-demand endpoint"
```

---

### Task 4: pricing konsumuje oba zdarzenia (`MarketDataStore` + fallback)

**Files:**
- Create: `services/pricing/src/Rezio.Pricing.Api/MarketDataStore.cs`
- Create: `services/pricing/src/Rezio.Pricing.Api/MarketDataConsumers.cs`
- Modify: `services/pricing/src/Rezio.Pricing.Api/InMemoryListingStore.cs` (MarketId oferty + odczyt ze store z fallbackiem)
- Modify: `services/pricing/src/Rezio.Pricing.Api/Program.cs` (rejestracja store + konsumerów w AddMassTransit)
- Modify: `services/pricing/tests/Rezio.Pricing.Api.Tests/PricePublisherTests.cs` (TYLKO dopisanie `.AddSingleton<MarketDataStore>()` do obu ServiceCollection — wymusza to nowy konstruktor InMemoryListingStore; asercje bez zmian)
- Test: `services/pricing/tests/Rezio.Pricing.Api.Tests/MarketDataStoreTests.cs`
- Test: `services/pricing/tests/Rezio.Pricing.Api.Tests/MarketDataConsumersTests.cs`

**Interfaces:**
- Consumes: `MarketStatsUpdated`, `DemandScoreUpdated` (Task 1); `MarketDaySnapshot` (plan 1)
- Produces:
  - `record MarketDayData(double? OccupancyRate, int? DemandScore, IReadOnlyList<string> DemandDrivers)`
  - `class MarketDataStore` (singleton) — `void SetStats(string marketId, DateOnly date, double occupancyRate)`, `void SetDemand(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers)`, `MarketDayData Get(string marketId, DateOnly date)` (brak wpisu → `(null, null, [])`; SetStats i SetDemand MERGE'ują się per klucz — jedno nie kasuje drugiego)
  - `class MarketStatsUpdatedConsumer(MarketDataStore store, ILogger<...>) : IConsumer<MarketStatsUpdated>` — zapis per linia + LogInformation
  - `class DemandScoreUpdatedConsumer(MarketDataStore store, ILogger<...>) : IConsumer<DemandScoreUpdated>` — zapis per linia + LogInformation
  - `InMemoryListingStore(MarketDataStore marketData)` — `lst_demo` z `MarketId = "mkt_gdansk"`; `MarketDays` per data: `occupancy = data.OccupancyRate ?? 0.70`, `score = data.DemandScore ?? (weekend ? 60 : 50)`, `drivers = data.DemandScore is null ? (weekend ? ["weekend"] : []) : data.DemandDrivers`

- [ ] **Step 1: Failing testy — MarketDataStore**

```csharp
namespace Rezio.Pricing.Api.Tests;

public class MarketDataStoreTests
{
    private static readonly DateOnly D = new(2026, 6, 4);

    [Fact]
    public void Empty_store_returns_nulls_and_empty_drivers()
    {
        var store = new Rezio.Pricing.Api.MarketDataStore();
        var data = store.Get("mkt_gdansk", D);
        Assert.Null(data.OccupancyRate);
        Assert.Null(data.DemandScore);
        Assert.Empty(data.DemandDrivers);
    }

    [Fact]
    public void Stats_and_demand_merge_per_key()
    {
        var store = new Rezio.Pricing.Api.MarketDataStore();
        store.SetStats("mkt_gdansk", D, 0.85);
        store.SetDemand("mkt_gdansk", D, 70, ["Boże Ciało"]);

        var data = store.Get("mkt_gdansk", D);
        Assert.Equal(0.85, data.OccupancyRate);
        Assert.Equal(70, data.DemandScore);
        Assert.Equal(["Boże Ciało"], data.DemandDrivers);
    }

    [Fact]
    public void Set_demand_then_stats_preserves_demand()
    {
        var store = new Rezio.Pricing.Api.MarketDataStore();
        store.SetDemand("mkt_gdansk", D, 70, ["Boże Ciało"]);
        store.SetStats("mkt_gdansk", D, 0.85);

        var data = store.Get("mkt_gdansk", D);
        Assert.Equal(70, data.DemandScore);
        Assert.Equal(0.85, data.OccupancyRate);
    }

    [Fact]
    public void Listing_store_falls_back_without_event_data_and_uses_it_when_present()
    {
        var marketData = new Rezio.Pricing.Api.MarketDataStore();
        var listings = new Rezio.Pricing.Api.InMemoryListingStore(marketData);

        // bez danych: fallback — wtorek 2026-06-09 => 0.70 / 50 / []
        var before = listings.MarketDays("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9)).Single();
        Assert.Equal(0.70, before.OccupancyRate);
        Assert.Equal(50, before.DemandScore);
        Assert.Empty(before.DemandDrivers);

        // z danymi z eventów
        marketData.SetStats("mkt_gdansk", new DateOnly(2026, 6, 9), 0.9);
        marketData.SetDemand("mkt_gdansk", new DateOnly(2026, 6, 9), 75, ["ferie zimowe (pomorskie)"]);
        var after = listings.MarketDays("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9)).Single();
        Assert.Equal(0.9, after.OccupancyRate);
        Assert.Equal(75, after.DemandScore);
        Assert.Equal(["ferie zimowe (pomorskie)"], after.DemandDrivers);
    }

    [Fact]
    public void Weekend_fallback_is_preserved_without_event_data()
    {
        var listings = new Rezio.Pricing.Api.InMemoryListingStore(new Rezio.Pricing.Api.MarketDataStore());
        var friday = listings.MarketDays("lst_demo", new DateOnly(2026, 6, 5), new DateOnly(2026, 6, 5)).Single();
        Assert.Equal(60, friday.DemandScore);
        Assert.Equal(["weekend"], friday.DemandDrivers);
    }
}
```

- [ ] **Step 2: Failing testy — konsumery (harness)**

```csharp
using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.Contracts;
using Rezio.Pricing.Api;

namespace Rezio.Pricing.Api.Tests;

public class MarketDataConsumersTests
{
    [Fact]
    public async Task Consumes_market_stats_into_store()
    {
        var store = new MarketDataStore();
        await using var provider = new ServiceCollection()
            .AddSingleton(store)
            .AddMassTransitTestHarness(x => x.AddConsumer<MarketStatsUpdatedConsumer>())
            .BuildServiceProvider(true);
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            await harness.Bus.Publish(new MarketStatsUpdated("mkt_gdansk",
                [new MarketStatsLine(new DateOnly(2026, 6, 4), 320m, 0.85, 30)]));

            Assert.True(await harness.Consumed.Any<MarketStatsUpdated>());
            Assert.Equal(0.85, store.Get("mkt_gdansk", new DateOnly(2026, 6, 4)).OccupancyRate);
        }
        finally { await harness.Stop(); }
    }

    [Fact]
    public async Task Consumes_demand_scores_into_store()
    {
        var store = new MarketDataStore();
        await using var provider = new ServiceCollection()
            .AddSingleton(store)
            .AddMassTransitTestHarness(x => x.AddConsumer<DemandScoreUpdatedConsumer>())
            .BuildServiceProvider(true);
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            await harness.Bus.Publish(new DemandScoreUpdated("mkt_gdansk",
                [new DemandScoreLine(new DateOnly(2026, 6, 4), 70, ["Boże Ciało"])]));

            Assert.True(await harness.Consumed.Any<DemandScoreUpdated>());
            var data = store.Get("mkt_gdansk", new DateOnly(2026, 6, 4));
            Assert.Equal(70, data.DemandScore);
            Assert.Contains("Boże Ciało", data.DemandDrivers);
        }
        finally { await harness.Stop(); }
    }
}
```

- [ ] **Step 3: Uruchom — FAIL kompilacją**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Api.Tests`
Expected: FAIL

- [ ] **Step 4: Implementacja**

`MarketDataStore.cs`:
```csharp
using System.Collections.Concurrent;

namespace Rezio.Pricing.Api;

public sealed record MarketDayData(double? OccupancyRate, int? DemandScore, IReadOnlyList<string> DemandDrivers);

public sealed class MarketDataStore
{
    private static readonly IReadOnlyList<string> NoDrivers = [];
    private readonly ConcurrentDictionary<(string MarketId, DateOnly Date), MarketDayData> _data = new();

    public void SetStats(string marketId, DateOnly date, double occupancyRate) =>
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(occupancyRate, null, NoDrivers),
            (_, existing) => existing with { OccupancyRate = occupancyRate });

    public void SetDemand(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers) =>
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(null, score, drivers),
            (_, existing) => existing with { DemandScore = score, DemandDrivers = drivers });

    public MarketDayData Get(string marketId, DateOnly date) =>
        _data.GetValueOrDefault((marketId, date)) ?? new MarketDayData(null, null, NoDrivers);
}
```

`MarketDataConsumers.cs`:
```csharp
using MassTransit;
using Rezio.Contracts;

namespace Rezio.Pricing.Api;

public sealed class MarketStatsUpdatedConsumer(MarketDataStore store, ILogger<MarketStatsUpdatedConsumer> logger)
    : IConsumer<MarketStatsUpdated>
{
    public Task Consume(ConsumeContext<MarketStatsUpdated> context)
    {
        var msg = context.Message;
        foreach (var line in msg.Stats)
            store.SetStats(msg.MarketId, line.Date, line.OccupancyRate);
        logger.LogInformation("Market stats for {MarketId}: {Days} day(s) updated", msg.MarketId, msg.Stats.Count);
        return Task.CompletedTask;
    }
}

public sealed class DemandScoreUpdatedConsumer(MarketDataStore store, ILogger<DemandScoreUpdatedConsumer> logger)
    : IConsumer<DemandScoreUpdated>
{
    public Task Consume(ConsumeContext<DemandScoreUpdated> context)
    {
        var msg = context.Message;
        foreach (var line in msg.Scores)
            store.SetDemand(msg.MarketId, line.Date, line.Score, line.Drivers);
        logger.LogInformation("Demand scores for {MarketId}: {Days} day(s) updated", msg.MarketId, msg.Scores.Count);
        return Task.CompletedTask;
    }
}
```

`InMemoryListingStore.cs` (całość — zamiana):
```csharp
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public sealed class InMemoryListingStore(MarketDataStore marketData) : IListingStore
{
    private const string DemoMarketId = "mkt_gdansk";
    private static readonly ListingSettings Demo = new(350m, 200m, 800m, MarketType.Seaside);
    private static readonly IReadOnlyList<string> WeekendDrivers = ["weekend"];
    private static readonly IReadOnlyList<string> NoDrivers = [];

    public ListingSettings? FindSettings(string listingId) =>
        listingId == "lst_demo" ? Demo : null;

    public IReadOnlyList<MarketDaySnapshot> MarketDays(string listingId, DateOnly from, DateOnly to)
    {
        var days = new List<MarketDaySnapshot>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var weekend = d.DayOfWeek is DayOfWeek.Friday or DayOfWeek.Saturday;
            var data = marketData.Get(DemoMarketId, d);

            // Dane z eventów, z degradacją do dotychczasowego fallbacku syntetycznego
            var occupancy = data.OccupancyRate ?? 0.70;
            var score = data.DemandScore ?? (weekend ? 60 : 50);
            var drivers = data.DemandScore is null
                ? (weekend ? WeekendDrivers : NoDrivers)
                : data.DemandDrivers;

            days.Add(new MarketDaySnapshot(d, occupancy, score, drivers));
        }
        return days;
    }
}
```

W `Program.cs`: `builder.Services.AddSingleton<MarketDataStore>();` (przed rejestracją IListingStore) oraz w bloku `AddMassTransit` dodaj konsumery:
```csharp
    x.AddConsumer<MarketStatsUpdatedConsumer>();
    x.AddConsumer<DemandScoreUpdatedConsumer>();
```

W `PricePublisherTests.cs`: do OBU ServiceCollection dopisz `.AddSingleton<MarketDataStore>()` (przed `.AddSingleton<IListingStore, InMemoryListingStore>()`); nic innego nie zmieniaj.

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS — w tym istniejące testy pricing bez zmian oczekiwań (fallback identyczny z dotychczasowym zachowaniem)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: pricing consumes market stats and demand scores with synthetic fallback"
```

---

### Task 5: compose (scraper/demand → RabbitMQ), README, weryfikacja pełnego przepływu danych

**Files:**
- Modify: `docker-compose.yml` (`RABBITMQ_URL` + `depends_on` rabbitmq dla `demand-api` i `scraper-api` — forma mapy z condition, jak pricing/channelsync)
- Modify: `README.md` (rozszerzenie sekcji pętli o przepływ danych)

**Interfaces:**
- Consumes: obrazy wszystkich serwisów (Taski 2–4)
- Produces: pełny przepływ danych na żywym stosie: scraper→pricing i demand→pricing przez RabbitMQ

- [ ] **Step 1: Rozszerz `docker-compose.yml`**

W blokach `demand-api` i `scraper-api`: dodaj `RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672` do environment i zamień listowe `depends_on: - loki` na formę mapy:
```yaml
    depends_on:
      loki:
        condition: service_started
      rabbitmq:
        condition: service_healthy
```

- [ ] **Step 2: Zaktualizuj `README.md`**

Rozszerz sekcję „Pętla cena→push" do „Przepływ danych i pętla cena→push":

```markdown
## Przepływ danych i pętla cena→push (zdarzenia)

1. `POST /v1/scrape-jobs` na scraper (:8082) z `{"market_id":"mkt_gdansk","from":"2026-06-04","to":"2026-06-10"}` → scraper publikuje `MarketStatsUpdated`, pricing zapisuje obłożenie rynku.
2. `POST /v1/markets/mkt_gdansk/publish-demand` na demand (:8081) z `{"from":"2026-06-04","to":"2026-06-10"}` → demand publikuje `DemandScoreUpdated`, pricing zapisuje demand score + drivery (np. „Boże Ciało").
3. `GET /v1/listings/lst_demo/prices?from=2026-06-04&to=2026-06-10` na pricing (:8080) → ceny liczone na danych z eventów (drivery widoczne w `components.demand_drivers`).
4. `POST /v1/connections {"provider":"beds24"}` na channel-sync (:8083), potem `POST /v1/listings/lst_demo/publish-prices` na pricing → channel-sync pushuje ceny (log `Pushed N rates` w Loki).

Bez zdarzeń pricing degraduje się do fallbacku syntetycznego (obłożenie 0.70, weekendowy demand 60).
```

- [ ] **Step 3: Odpal cały system i zweryfikuj przepływ danych end-to-end**

Run: `docker compose up --build -d`, poczekaj na rabbitmq healthy, potem (pricing przez host :8080 albo — jeśli zajęty przez MTAgentService — z wnętrza sieci kontenerów / scratchpadowy override portu, NIE commitowany):
- `POST :8082/v1/scrape-jobs {"market_id":"mkt_gdansk","from":"2026-06-04","to":"2026-06-10"}` → 200; Loki `{service="pricing-api"}` zawiera „Market stats for mkt_gdansk: 7 day(s) updated"
- `POST :8081/v1/markets/mkt_gdansk/publish-demand {"from":"2026-06-04","to":"2026-06-10"}` → 202; Loki pricing: „Demand scores for mkt_gdansk: 7 day(s) updated"
- `GET pricing /v1/listings/lst_demo/prices?from=2026-06-04&to=2026-06-10` → 200; pozycja 2026-06-04 ma w `components.demand_drivers` „Boże Ciało" (dane z demand przez brokera!) i `market_occupancy` wynikające ze scrape'a (nie fallbackowe 1.10 dla 0.70 — obłożenie z syntetycznego scrape'a różni się od 0.70)
- pętla push nadal działa: `POST :8083/v1/connections {"provider":"beds24"}` → `POST pricing /v1/listings/lst_demo/publish-prices` (zakres 06-04..06-10, connection id z poprzedniego kroku) → Loki `{service="channelsync-api"}`: „Pushed 7 rates"
- HealthChecks UI: 4 serwisy Healthy; `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: wire scraper and demand to RabbitMQ; document data flow"
```

---

## Poza zakresem tego planu (kolejne plany)

- Świeżość danych (spec §6): znacznik `stale` gdy staty starsze niż 7 dni + degradacja — wymaga zegara i metadanych czasu zapisu (razem z Postgresem)
- `ReservationCreated` z channel-sync → pricing/ML; `sync.completed`/`connection.error`
- Persystencja (Postgres/EF Core) + outbox/idempotencja konsumentów (obecnie konsument jest naturalnie idempotentny — nadpisuje per klucz)
- Mapowanie oferta→rynek jako dane (teraz stała `lst_demo`→`mkt_gdansk`; z Postgresem: tabela listings)
- api-gateway + auth; realne adaptery scrapingu i CM
