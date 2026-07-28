# Rezio MVP — Plan 8: konsolidacja do modularnego monolitu (scraper osobno, bez RabbitMQ)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwinąć pricing + demand + channel-sync w jeden deployowalny monolit `Rezio.Api` z wywołaniami w procesie; scraper zostaje osobnym serwisem i po każdym scrapie **POST-uje statystyki po HTTP** do monolitu. Usunąć RabbitMQ, MassTransit i projekt `Rezio.Contracts` całkowicie. Domena (czyste projekty `*.Domain` + ich testy) zostaje nietknięta — to trzon 178 testów.

**Architecture:** Monolit `Rezio.Api` referuje trzy istniejące projekty domenowe (`Rezio.Pricing.Domain`, `Rezio.Demand.Domain`, `Rezio.ChannelSync.Domain`) i wystawia ich endpointy jako moduły w jednym procesie. Wewnętrzne przepływy, które były eventami, stają się wywołaniami:
- **demand → pricing:** pricing liczy popyt **inline** przez `DemandScoreCalculator` (znika event `DemandScoreUpdated`, publisher, konsument, fallback weekendowy).
- **pricing → push:** endpoint `publish-prices` bezpośrednio pushuje przez `RatePushService` (znika event `PriceComputed`, publisher, konsument).
- **scraper → pricing:** granica zostaje; scraper POST-uje na `POST /v1/internal/market-stats` monolitu (znika event `MarketStatsUpdated`, broker).

**Świadoma zmiana zachowania:** popyt w cenach jest teraz **prawdziwy** (kalendarz świąt/ferii/mostków przez `DemandScoreCalculator`), a nie proste proxy weekendowe (60/50). Golden testy silnika (`PricingEngineTests`, jawne `MarketDaySnapshot`) są nietknięte; testy API poziomu HTTP nie asertują dokładnych cen zależnych od popytu, więc powinny przejść — jeśli któryś asertuje, przelicz oczekiwaną wartość i zweryfikuj względem kalkulatorów.

**Tech Stack:** .NET 10, C#, ASP.NET Core minimal APIs, EF Core 10 + Postgres (bez zmian), xUnit. **Usuwane:** MassTransit, MassTransit.RabbitMQ, RabbitMQ, Rezio.Contracts.

## Global Constraints

- TargetFramework: `net10.0`; `TreatWarningsAsErrors=true`; stan wyjściowy: 178 testów zielonych
- Domena i testy domenowe (`services/*/src/*.Domain`, `services/*/tests/*.Domain.Tests`) NIE zmieniają się (poza scraperem: domena scrapera też bez zmian)
- Po konsolidacji ZERO odwołań do `MassTransit`, `RabbitMQ`, `Rezio.Contracts` w całym repo (weryfikacja grep na końcu)
- Monolit: jeden host `Rezio.Api`, jeden Postgres, `DATABASE_URL` jak dotąd; scraper: `MONOLITH_URL` wskazuje monolit
- JSON snake_case, problem+json, limit zakresu dat `>= 365` → 400 (bez zmian)
- `MarketDataStore`/encja EF/migracja zostają jak są; po konsolidacji `SetDemandAsync` staje się nieużywany (kolumny demand vestigial) — czyszczenie odłożone (bez nowej migracji)
- Commit po każdym tasku; komunikaty `refactor:`/`feat:`/`chore:`
- Renamy mechaniczne: zachowaj końcowe newline w `.csproj`, zaktualizuj `Rezio.slnx`, `Dockerfile`, `docker-compose.yml` build context

---

### Task 1: Rename `Rezio.Pricing.Api` → `Rezio.Api` (monolit-host)

**Files (git mv + edycje):**
- Move: `services/pricing/src/Rezio.Pricing.Api/` → `services/monolith/src/Rezio.Api/` (cała zawartość: Program.cs, Persistence/, Migrations/, PricePublisher.cs, MarketData*, IListingStore.cs, InMemoryListingStore.cs, IMarketDataStore.cs, StoreSelection.cs, Contracts.cs, csproj, appsettings, launchSettings)
- Move: `services/pricing/tests/Rezio.Pricing.Api.Tests/` → `services/monolith/tests/Rezio.Api.Tests/`
- Rename plik projektu: `Rezio.Pricing.Api.csproj` → `Rezio.Api.csproj`; test: `Rezio.Api.Tests.csproj`
- Modify: `Rezio.slnx` (ścieżki+nazwy), `services/pricing/Dockerfile` → `services/monolith/Dockerfile` (publish path), `docker-compose.yml` (build context pricing-api → rezio-api tymczasowo — pełny compose w Task 6)

**Interfaces:**
- Produces: host o nazwie `Rezio.Api`, namespace `Rezio.Api` (i `Rezio.Api.Persistence`), reszta bez zmian funkcjonalnych

- [ ] **Step 1: Przenieś projekty**

```bash
mkdir -p services/monolith/src services/monolith/tests
git mv services/pricing/src/Rezio.Pricing.Api services/monolith/src/Rezio.Api
git mv services/pricing/tests/Rezio.Pricing.Api.Tests services/monolith/tests/Rezio.Api.Tests
git mv services/monolith/src/Rezio.Api/Rezio.Pricing.Api.csproj services/monolith/src/Rezio.Api/Rezio.Api.csproj
git mv services/monolith/tests/Rezio.Api.Tests/Rezio.Pricing.Api.Tests.csproj services/monolith/tests/Rezio.Api.Tests/Rezio.Api.Tests.csproj
git mv services/pricing/Dockerfile services/monolith/Dockerfile
```

- [ ] **Step 2: Zamień namespace i nazwy**

Zamień we WSZYSTKICH plikach `.cs` pod `services/monolith/` oraz w referencjach: `namespace Rezio.Pricing.Api` → `namespace Rezio.Api`, `using Rezio.Pricing.Api` → `using Rezio.Api`, `Rezio.Pricing.Api.Persistence` → `Rezio.Api.Persistence`, `Rezio.Pricing.Api.Tests` → `Rezio.Api.Tests`, oraz `public partial class Program` pozostaje (namespace zmieniony). W `Rezio.Api.csproj`: referencja do `Rezio.Pricing.Domain` — ścieżka względna zmienia głębokość (`..\..\..\pricing\src\Rezio.Pricing.Domain\Rezio.Pricing.Domain.csproj`). W `Rezio.Api.Tests.csproj`: referencja do `..\..\src\Rezio.Api\Rezio.Api.csproj`. W Dockerfile: `dotnet publish services/monolith/src/Rezio.Api` i `Rezio.Api.dll`.
Migracje (`Migrations/*.cs`, snapshot, Designer): zamień namespace `Rezio.Pricing.Api.Persistence`/`Rezio.Pricing.Api.Migrations` → `Rezio.Api.Persistence`/`Rezio.Api.Migrations` oraz atrybuty `[DbContext(typeof(PricingDbContext))]` (typ zostaje `PricingDbContext`, tylko namespace się zmienia).

- [ ] **Step 3: Zaktualizuj `Rezio.slnx`**

Usuń stare wpisy `services/pricing/src/Rezio.Pricing.Api` i `services/pricing/tests/Rezio.Pricing.Api.Tests`, dodaj `services/monolith/src/Rezio.Api` i `services/monolith/tests/Rezio.Api.Tests` (folder `/services/monolith/`).

- [ ] **Step 4: Build + test**

Run: `dotnet build && dotnet test`
Expected: 178 zielonych, 0 warningów (czysty rename)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename Rezio.Pricing.Api to Rezio.Api (monolith host)"
```

---

### Task 2: Wchłoń moduł demand (endpoint zapytań + rejestr; usuń demand Api)

**Files:**
- Modify: `services/monolith/src/Rezio.Api/Rezio.Api.csproj` (dodaj ProjectReference do `Rezio.Demand.Domain`)
- Modify: `services/monolith/src/Rezio.Api/Program.cs` (rejestracja `IMarketRegistry`→`InMemoryMarketRegistry`; endpoint `GET /v1/markets/{id}/demand`; kontrakt `DemandResponse`)
- Create: `services/monolith/tests/Rezio.Api.Tests/DemandEndpointTests.cs` (przeniesiony z demand Api.Tests, namespace `Rezio.Api.Tests`)
- Delete: `services/demand/src/Rezio.Demand.Api/`, `services/demand/tests/Rezio.Demand.Api.Tests/` (z `Rezio.slnx`)

**Interfaces:**
- Consumes: `IMarketRegistry`, `CalendarSignals`, `DemandScoreCalculator`, `Market` (Rezio.Demand.Domain)
- Produces: monolit wystawia `GET /v1/markets/{id}/demand` (zachowanie identyczne jak w demand-service); rejestr rynków dostępny w procesie dla Task 4

- [ ] **Step 1: Referencja + usuń demand Api z solucji**

```bash
dotnet add services/monolith/src/Rezio.Api reference services/demand/src/Rezio.Demand.Domain
dotnet sln Rezio.slnx remove services/demand/src/Rezio.Demand.Api services/demand/tests/Rezio.Demand.Api.Tests
git rm -r services/demand/src/Rezio.Demand.Api services/demand/tests/Rezio.Demand.Api.Tests
```

- [ ] **Step 2: Przenieś endpoint demand do monolitu**

W `Program.cs` monolitu dodaj `using Rezio.Demand.Domain;`, rejestrację `builder.Services.AddSingleton<IMarketRegistry, InMemoryMarketRegistry>();` i endpoint (skopiowany z byłego demand Program.cs, BEZ publish-demand — ten znika):
```csharp
app.MapGet("/v1/markets/{id}/demand",
    (string id, DateOnly from, DateOnly to, IMarketRegistry registry) =>
{
    if (to < from || to.DayNumber - from.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var market = registry.Find(id);
    if (market is null)
        return Results.Problem(statusCode: 404, title: "Market not found");

    var scores = CalendarSignals.ForRange(from, to)
        .Select(signals => DemandScoreCalculator.Score(market.Type, market.Voivodeship, signals))
        .ToList();
    return Results.Ok(new DemandResponse(id, scores));
});
```
Dodaj do `Contracts.cs` monolitu: `public sealed record DemandResponse(string MarketId, IReadOnlyList<Rezio.Demand.Domain.DemandScore> Scores);`

- [ ] **Step 3: Przenieś testy demand**

Skopiuj `DemandEndpointTests` do `Rezio.Api.Tests` (namespace `Rezio.Api.Tests`, `WebApplicationFactory<Program>` teraz celuje w monolit; testy `mkt_zakopane` bez zmian — rejestr ten sam). NIE przenoś testów publish-demand (endpoint usunięty).

- [ ] **Step 4: Build + test**

Run: `dotnet build && dotnet test`
Expected: zielono (testy demand-domenowe bez zmian; demand endpoint działa w monolicie)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: fold demand module into monolith (query endpoint + registry)"
```

---

### Task 3: Wchłoń moduł channel-sync (connections/listings/sync; usuń channelsync Api)

**Files:**
- Modify: `services/monolith/src/Rezio.Api/Rezio.Api.csproj` (ref `Rezio.ChannelSync.Domain`)
- Modify: `services/monolith/src/Rezio.Api/Program.cs` (DI: `ConnectionRegistry`, `SyncRunner`, `IAdapterFactory`→`SyntheticAdapterFactory`, `RatePushService`; endpointy connections/listings/sync; kontrakty)
- Create: `services/monolith/src/Rezio.Api/AdapterFactory.cs` (przeniesiony)
- Create: `services/monolith/tests/Rezio.Api.Tests/ChannelSyncEndpointTests.cs` (przeniesiony)
- Delete: `services/channelsync/src/Rezio.ChannelSync.Api/`, `services/channelsync/tests/Rezio.ChannelSync.Api.Tests/` (z `Rezio.slnx`)

**Interfaces:**
- Consumes: `ConnectionRegistry`, `SyncRunner`, `SyntheticChannelAdapter`, `RatePushService`, `IChannelAdapter` (Rezio.ChannelSync.Domain)
- Produces: monolit wystawia `POST/GET /v1/connections`, `GET .../listings`, `POST .../sync`; `RatePushService` i `ConnectionRegistry` dostępne w procesie dla Task 4 (push cen)

- [ ] **Step 1: Referencja + usuń channelsync Api**

```bash
dotnet add services/monolith/src/Rezio.Api reference services/channelsync/src/Rezio.ChannelSync.Domain
dotnet sln Rezio.slnx remove services/channelsync/src/Rezio.ChannelSync.Api services/channelsync/tests/Rezio.ChannelSync.Api.Tests
git rm -r services/channelsync/src/Rezio.ChannelSync.Api services/channelsync/tests/Rezio.ChannelSync.Api.Tests
```

- [ ] **Step 2: Przenieś AdapterFactory + endpointy + DI**

Skopiuj `AdapterFactory.cs` (namespace `Rezio.Api`, `IAdapterFactory`/`SyntheticAdapterFactory`). W `Program.cs` dodaj `using Rezio.ChannelSync.Domain;`, rejestracje:
```csharp
builder.Services.AddSingleton<ConnectionRegistry>();
builder.Services.AddSingleton<SyncRunner>();
builder.Services.AddSingleton<IAdapterFactory, SyntheticAdapterFactory>();
builder.Services.AddSingleton(new RatePushService((delay, ct) => Task.Delay(delay, ct)));
```
oraz endpointy `POST /v1/connections`, `GET /v1/connections/{id}`, `GET /v1/connections/{id}/listings`, `POST /v1/connections/{id}/sync` (przeniesione z byłego channelsync Program.cs, wraz z guardem `int.TryParse || !Enum.TryParse || !Enum.IsDefined`). Kontrakty (`CreateConnectionRequest`, `ConnectionResponse`, `ListingsResponse`, `SyncRequest`) do `Contracts.cs` monolitu.

- [ ] **Step 3: Przenieś testy channel-sync**

Skopiuj `ChannelSyncEndpointTests` do `Rezio.Api.Tests` (namespace, `WebApplicationFactory<Program>` → monolit). NIE przenoś `PriceComputedConsumerTests` (konsument znika w Task 4).

- [ ] **Step 4: Build + test**

Run: `dotnet build && dotnet test`
Expected: zielono

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: fold channel-sync module into monolith (connections/listings/sync)"
```

---

### Task 4: Wewnętrzne wywołania zamiast eventów + usuń MassTransit/Contracts

**Files:**
- Modify: `services/monolith/src/Rezio.Api/InMemoryListingStore.cs` (popyt inline; ctor bierze `IMarketRegistry`)
- Modify: `services/monolith/src/Rezio.Api/PricePublisher.cs` → `services/monolith/src/Rezio.Api/PricePusher.cs` (liczy ceny i pushuje w procesie zamiast publikować)
- Modify: `services/monolith/src/Rezio.Api/Program.cs` (usuń AddMassTransit + konsumery + publish PriceComputed; endpoint publish-prices woła PricePusher; nowy `POST /v1/internal/market-stats`)
- Delete: `services/monolith/src/Rezio.Api/MarketDataConsumers.cs`, `PriceComputedConsumer.cs` (jeśli przeniesiony w Task 3 — nie przenoś go), stare harness-testy
- Modify: `services/monolith/src/Rezio.Api/Rezio.Api.csproj` (usuń pakiety MassTransit, MassTransit.RabbitMQ, referencję Rezio.Contracts)
- Modify: testy — zastąp `PricePublisherTests`/`MarketDataConsumersTests` odpowiednikami in-process
- Delete: `contracts/Rezio.Contracts/`, `contracts/Rezio.Contracts.Tests/` (z `Rezio.slnx`)
- Create: `services/monolith/tests/Rezio.Api.Tests/MarketStatsIngestTests.cs`, `PricePusherTests.cs`, `InlineDemandPricingTests.cs`

**Interfaces:**
- Produces:
  - `POST /v1/internal/market-stats` (body `{market_id, stats:[{date, median_price, occupancy_rate, active_listings}]}`) → 202; zapis obłożenia do `MarketDataStore.SetStatsAsync`
  - `class PricePusher(IListingStore store, ConnectionRegistry registry, IAdapterFactory factory, RatePushService push, ILogger)` z `Task<int> PushAsync(listingId, connectionId, externalListingId, from, to, today, ct)` — liczy rekomendacje, buduje `RateUpdate[]`, pushuje; 0 gdy oferta nieznana
  - `InMemoryListingStore(IMarketDataStore marketData, IMarketRegistry demandRegistry)` — popyt inline: `signals = CalendarSignals.ForRange(d,d).Single(); score = DemandScoreCalculator.Score(mkt.Type, mkt.Voivodeship, signals)`; obłożenie ze store z fallbackiem 0.70

- [ ] **Step 1: Popyt inline w `InMemoryListingStore`**

```csharp
using Rezio.Demand.Domain;
using Rezio.Pricing.Domain;

namespace Rezio.Api;

public sealed class InMemoryListingStore(IMarketDataStore marketData, IMarketRegistry demandRegistry) : IListingStore
{
    private const string DemoMarketId = "mkt_gdansk";
    private static readonly ListingSettings Demo = new(350m, 200m, 800m, MarketType.Seaside);

    public ListingSettings? FindSettings(string listingId) =>
        listingId == "lst_demo" ? Demo : null;

    public async Task<IReadOnlyList<MarketDaySnapshot>> MarketDaysAsync(
        string listingId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var demandMarket = demandRegistry.Find(DemoMarketId)!; // mkt_gdansk → Seaside/Pomorskie
        var days = new List<MarketDaySnapshot>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var occupancy = (await marketData.GetAsync(DemoMarketId, d, ct)).OccupancyRate ?? 0.70;
            var signals = CalendarSignals.ForRange(d, d).Single();
            var demand = DemandScoreCalculator.Score(demandMarket.Type, demandMarket.Voivodeship, signals);
            days.Add(new MarketDaySnapshot(d, occupancy, demand.Score, demand.Drivers));
        }
        return days;
    }
}
```

- [ ] **Step 2: `PricePusher` (compute + push w procesie)**

```csharp
using Rezio.ChannelSync.Domain;
using Rezio.Pricing.Domain;

namespace Rezio.Api;

public sealed class PricePusher(
    IListingStore store, ConnectionRegistry registry,
    IAdapterFactory factory, RatePushService push, ILogger<PricePusher> logger)
{
    public async Task<int> PushAsync(
        string listingId, string connectionId, string externalListingId,
        DateOnly from, DateOnly to, DateOnly today, CancellationToken ct)
    {
        var settings = store.FindSettings(listingId);
        if (settings is null) return 0;

        var connection = registry.Find(connectionId);
        if (connection is null) return 0;

        var recs = await store.MarketDaysAsync(listingId, from, to, ct);
        var rates = recs
            .Select(day => PricingEngine.Recommend(settings, day, today))
            .Select(rec => new RateUpdate(rec.Date, rec.RecommendedPrice))
            .ToList();

        var adapter = factory.For(connection.Provider);
        var outcome = await push.PushAsync(adapter, externalListingId, rates, from, to, maxAttempts: 3, ct);
        if (outcome is PushOutcome.Failed f)
            logger.LogError("Rate push to {Ext} failed after {N}: {Err}", externalListingId, f.AttemptsUsed, f.LastError);
        else
            logger.LogInformation("Pushed {N} rates to {Ext}", rates.Count, externalListingId);
        return rates.Count;
    }
}
```
Uwaga: liczba dni w recs = liczba dni w [from,to] (inclusive), więc plan cen zawsze pokrywa cały zakres → walidator „pełny kalendarz albo nic" przechodzi. `PushAsync` zwraca 0 gdy oferta LUB połączenie nieznane.

- [ ] **Step 3: Endpointy w `Program.cs`**

Usuń: `AddMassTransit(...)`, wszystkie `x.AddConsumer<...>`, rejestrację `PricePublisher`, `using MassTransit`, `using Rezio.Contracts`. Zarejestruj `builder.Services.AddScoped<PricePusher>();`. Endpoint publish-prices:
```csharp
app.MapPost("/v1/listings/{id}/publish-prices",
    async (string id, PublishPricesRequest request, PricePusher pusher, TimeProvider clock, CancellationToken ct) =>
{
    if (request.To < request.From || request.To.DayNumber - request.From.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range", detail: "...");
    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var days = await pusher.PushAsync(id, request.ConnectionId, request.ExternalListingId, request.From, request.To, today, ct);
    return days == 0
        ? Results.Problem(statusCode: 404, title: "Listing or connection not found")
        : Results.Accepted($"/v1/listings/{id}/prices", new PublishPricesResponse(days));
});
```
Nowy endpoint ingestu (scraper → monolit):
```csharp
app.MapPost("/v1/internal/market-stats",
    async (MarketStatsIngestRequest request, IMarketDataStore store, CancellationToken ct) =>
{
    foreach (var line in request.Stats)
        await store.SetStatsAsync(request.MarketId, line.Date, line.OccupancyRate, ct);
    return Results.Accepted(value: new { ingested_days = request.Stats.Count });
});
```
Kontrakty do `Contracts.cs`:
```csharp
public sealed record MarketStatsIngestLine(DateOnly Date, decimal MedianPrice, double OccupancyRate, int ActiveListings);
public sealed record MarketStatsIngestRequest(string MarketId, IReadOnlyList<MarketStatsIngestLine> Stats);
```

- [ ] **Step 4: Usuń MassTransit/Contracts**

```bash
dotnet remove services/monolith/src/Rezio.Api package MassTransit
dotnet remove services/monolith/src/Rezio.Api package MassTransit.RabbitMQ
dotnet sln Rezio.slnx remove contracts/Rezio.Contracts contracts/Rezio.Contracts.Tests
git rm -r contracts/Rezio.Contracts contracts/Rezio.Contracts.Tests
git rm services/monolith/src/Rezio.Api/MarketDataConsumers.cs services/monolith/src/Rezio.Api/PricePublisher.cs
```
Usuń stare testy harness (`PricePublisherTests.cs`, `MarketDataConsumersTests.cs`) i pakiet MassTransit z `Rezio.Api.Tests.csproj`.

- [ ] **Step 5: Nowe testy in-process**

`MarketStatsIngestTests.cs` (HTTP): POST /v1/internal/market-stats → 202; potem GET prices dla tej daty pokazuje obłożenie z ingestu (nie 0.70).
`PricePusherTests.cs` (WebApplicationFactory): utwórz połączenie (POST /v1/connections), POST publish-prices → 202 `published_days`; nieznana oferta/połączenie → 404.
`InlineDemandPricingTests.cs`: GET /v1/listings/lst_demo/prices dla zakresu z **Bożym Ciałem 2026-06-04** (mkt_gdansk = Seaside) → w `components.demand_drivers` pojawia się driver święta BEZ żadnego eventu (dowód, że popyt liczy się inline). Weryfikacja: dla Seaside Boże Ciało w długim weekendzie → demand > 50.

- [ ] **Step 6: Build + test**

Run: `dotnet build && dotnet test`
Expected: zielono; jeśli któryś istniejący `PricesEndpointTests` asertował dokładną cenę zależną od popytu — przelicz oczekiwaną wartość względem `DemandScoreCalculator` × `PricingEngine` i popraw asercję (odnotuj w raporcie jako zamierzoną zmianę: popyt inline).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: replace event flows with in-process calls; remove MassTransit and Contracts"
```

---

### Task 5: Scraper POST-uje statystyki do monolitu (koniec MassTransit w scraperze)

**Files:**
- Modify: `services/scraper/src/Rezio.Scraper.Api/ScrapeAndPublish.cs` (POST HTTP zamiast publish)
- Modify: `services/scraper/src/Rezio.Scraper.Api/Program.cs` (usuń MassTransit; `HttpClient` z `MONOLITH_URL`)
- Modify: `services/scraper/src/Rezio.Scraper.Api/Rezio.Scraper.Api.csproj` (usuń MassTransit/RabbitMQ + ref Contracts; dodaj nic — HttpClient wbudowany)
- Modify: `services/scraper/tests/Rezio.Scraper.Api.Tests/Rezio.Scraper.Api.Tests.csproj` (usuń MassTransit)
- Modify: `services/scraper/tests/Rezio.Scraper.Api.Tests/ScrapeAndPublishTests.cs` (harness → fake HttpMessageHandler)

**Interfaces:**
- Produces: `ScrapeAndPublish(ScrapeRunner runner, IStatsStore store, HttpClient http)` — po scrapie POST na `/v1/internal/market-stats` z własnym DTO scrapera; gdy `MONOLITH_URL` nieustawione, POST pomijany (log warning) — scrape i tak działa

- [ ] **Step 1: Usuń MassTransit ze scrapera**

```bash
dotnet remove services/scraper/src/Rezio.Scraper.Api package MassTransit
dotnet remove services/scraper/src/Rezio.Scraper.Api package MassTransit.RabbitMQ
dotnet remove services/scraper/tests/Rezio.Scraper.Api.Tests package MassTransit
```
Usuń referencję `Rezio.Contracts` z csproj scrapera (już usunięta z solucji w Task 4). Usuń `using MassTransit`/`Rezio.Contracts` z Program.cs i ScrapeAndPublish.

- [ ] **Step 2: `ScrapeAndPublish` przez HTTP**

```csharp
using System.Net.Http.Json;
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api;

public sealed record MarketStatsPostLine(DateOnly Date, decimal MedianPrice, double OccupancyRate, int ActiveListings);
public sealed record MarketStatsPost(string MarketId, IReadOnlyList<MarketStatsPostLine> Stats);

public sealed class ScrapeAndPublish(ScrapeRunner runner, IStatsStore store, HttpClient http, ILogger<ScrapeAndPublish> logger)
{
    public async Task<ScrapeResult> RunAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var result = await runner.RunAsync(marketId, from, to, ct);
        if (result.DaysAggregated > 0)
        {
            var stats = store.Get(marketId, from, to)
                .Select(s => new MarketStatsPostLine(s.Date, s.MedianPrice, s.OccupancyRate, s.ActiveListings))
                .ToList();
            try
            {
                using var resp = await http.PostAsJsonAsync("/v1/internal/market-stats", new MarketStatsPost(marketId, stats), ct);
                resp.EnsureSuccessStatusCode();
            }
            catch (Exception ex) { logger.LogError(ex, "Failed to POST market stats to monolith for {MarketId}", marketId); }
        }
        return result;
    }
}
```
Uwaga: DTO scrapera (`MarketStatsPost`) ma JSON-owo identyczny kształt jak `MarketStatsIngestRequest` monolitu (snake_case: `market_id`, `stats`, `median_price`, `occupancy_rate`, `active_listings`). Konfiguracja `HttpClient` JSON snake_case w Program.cs (albo `JsonSerializerOptions` z `SnakeCaseLower` w `PostAsJsonAsync`).

W `Program.cs` scrapera:
```csharp
builder.Services.AddHttpClient<ScrapeAndPublish>(c =>
{
    var url = builder.Configuration["MONOLITH_URL"];
    if (!string.IsNullOrWhiteSpace(url)) c.BaseAddress = new Uri(url);
});
```
(Gdy `MONOLITH_URL` puste, `BaseAddress` null → `PostAsJsonAsync` rzuci; złap i zaloguj — patrz try/catch. Alternatywnie: pomiń POST gdy brak BaseAddress.) Zadbaj o snake_case: skonfiguruj `JsonSerializerOptions` przekazywane do `PostAsJsonAsync`.

- [ ] **Step 3: Test bez harnessu**

`ScrapeAndPublishTests`: wstrzyknij `HttpClient` z fake `HttpMessageHandler`, który przechwytuje request; asertuj, że dla znanego rynku POST poszedł na `/v1/internal/market-stats` z 7 liniami i `market_id=mkt_gdansk` (deserializuj przechwycone body), a dla nieznanego rynku POST NIE poszedł. Endpoint HTTP scrapera (`POST /v1/scrape-jobs`) niezmieniony w kontrakcie.

- [ ] **Step 4: Build + test**

Run: `dotnet build && dotnet test`
Expected: zielono; grep potwierdza brak `MassTransit`/`Rezio.Contracts` w repo:
`grep -rn "MassTransit\|Rezio.Contracts" services contracts 2>/dev/null` → pusto (poza ewentualnie usuniętymi ścieżkami)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: scraper posts market stats to monolith over HTTP (drop MassTransit)"
```

---

### Task 6: Compose (monolit + scraper + Postgres, bez RabbitMQ), README, e2e

**Files:**
- Modify: `docker-compose.yml` (usuń rabbitmq/pricing-api/demand-api/channelsync-api; dodaj `rezio-api`; scraper `MONOLITH_URL`; healthchecks-ui 2 wpisy)
- Modify: `README.md` (nowa architektura: monolit + scraper, przepływ HTTP)

**Interfaces:**
- Produces: `docker compose up` podnosi `rezio-api` (:8080, Postgres), `scraper-api` (:8082, `MONOLITH_URL=http://rezio-api:8080`), `postgres`, `loki`, `grafana`, `healthchecks-ui` (monitoruje rezio-api + scraper-api). Brak RabbitMQ.

- [ ] **Step 1: Przebuduj `docker-compose.yml`**

Usuń serwisy `rabbitmq`, `pricing-api`, `demand-api`, `channelsync-api`. Dodaj:
```yaml
  rezio-api:
    build:
      context: .
      dockerfile: services/monolith/Dockerfile
    ports:
      - "8080:8080"
    environment:
      LOKI_URL: http://loki:3100
      DATABASE_URL: Host=postgres;Database=rezio;Username=rezio;Password=rezio
    depends_on:
      loki:
        condition: service_started
      postgres:
        condition: service_healthy
```
W `scraper-api`: usuń `RABBITMQ_URL`, dodaj `MONOLITH_URL: http://rezio-api:8080`, `depends_on` tylko loki (+ ewentualnie rezio-api service_started). `healthchecks-ui`: wpisy `__0__` rezio-api → `http://rezio-api:8080/health`, `__1__` scraper-api → `http://scraper-api:8080/health`; `depends_on` rezio-api + scraper-api. `postgres`, `loki`, `grafana` bez zmian.

- [ ] **Step 2: README — nowa architektura**

Zastąp opis mikroserwisowy: „Monolit `rezio-api` (:8080, moduły pricing/demand/channel-sync, Postgres) + osobny `scraper-api` (:8082) który POST-uje statystyki do monolitu. Bez RabbitMQ." Zaktualizuj tabelę usług (usuń wiersze demand/channel-sync/RabbitMQ jako osobne; dodaj rezio-api). Zaktualizuj sekcję przepływu: scrape → scraper POST-uje na `/v1/internal/market-stats` → GET prices; publish-prices pushuje w procesie.

- [ ] **Step 3: e2e**

`docker compose up --build -d`, poczekaj na postgres healthy + rezio-api (migracja EF), potem (rezio-api przez host :8080 albo scratchpadowy override portu jeśli zajęty — NIE commitowany):
- `POST :8082/v1/scrape-jobs {"market_id":"mkt_gdansk","from":"2026-06-01","to":"2026-06-10"}` → 200; Loki `{service="scraper-api"}` bez błędów POST; Loki brak — sprawdź, że rezio-api dostał ingest (log lub kolejny krok)
- `GET :8080/v1/listings/lst_demo/prices?from=2026-06-01&to=2026-06-10` → 200; `market_occupancy` odzwierciedla scrape (≠ fallback), a `components.demand_drivers` dla 2026-06-04 zawiera driver Bożego Ciała (popyt inline, BEZ eventu!)
- `GET :8080/v1/markets/mkt_zakopane/demand?from=2026-06-04&to=2026-06-07` → 200 (moduł demand w monolicie)
- `POST :8080/v1/connections {"provider":"beds24"}` → 201; `POST :8080/v1/listings/lst_demo/publish-prices {connection_id, external_listing_id:"beds24-listing-1", from:"2026-06-01", to:"2026-06-10"}` → 202; Loki `{service="rezio-api"}`: „Pushed 10 rates" (push w procesie)
- `docker compose restart rezio-api`; ponów GET prices → obłożenie ze scrape'a DALEJ obecne (Postgres)
- HealthChecks UI: 2 serwisy Healthy; `docker compose down` (bez -v)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: compose for monolith + standalone scraper; drop RabbitMQ; update README"
```

---

## Poza zakresem tego planu (kolejne)

- Czyszczenie: nieużywane `SetDemandAsync` + kolumny demand w `market_data` (vestigial po popycie inline) — osobna migracja
- Unifikacja zduplikowanego enuma `MarketType` (pricing vs demand) — teraz współistnieją w monolicie
- Whole-row clobber przy współbieżnym UPDATE do Postgresa (concurrency token) — nadal odłożone
- Realne adaptery scrapingu/CM, api-gateway + auth
- Ewentualny powrót do async messagingu, gdy pojawi się realna potrzeba (drugi konsument, inne skalowanie modułu)
