# Rezio MVP — Plan 7: persystencja pricing (EF Core + Postgres) + świeżość danych

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dać serwisowi pricing trwałą pamięć danych rynkowych z eventów (Postgres/EF Core zamiast in-memory), z zachowaniem świeżości (§6: dane starsze niż 7 dni degradują się do fallbacku syntetycznego). Bez brokera/DB (lokalnie, w testach) serwis dalej działa na fallbacku — persystencja jest addytywna.

**Architecture:** `MarketDataStore` staje się asynchronicznym interfejsem `IMarketDataStore` z dwiema implementacjami: `InMemoryMarketDataStore` (domyślna, gdy brak `DATABASE_URL`) i `EfMarketDataStore` (Postgres w produkcji). Do `MarketDayData` dochodzi `LastWrittenAt`; `GetAsync` zwraca dane tylko jeśli świeże (≤ 7 dni wg wstrzykniętego `TimeProvider`), inaczej null-object → fallback. Read-path pricing (`InMemoryListingStore.MarketDays` → `MarketDaysAsync`, endpoint GET, `PricePublisher`) przechodzi na async — bez zmiany zachowania HTTP, więc istniejące testy endpointów przechodzą bez modyfikacji oczekiwań. Testy EF na **SQLite in-memory** (realny SQL, deterministyczne, bez Dockera); produkcja na Npgsql z migracjami; testy SQLite używają `EnsureCreated` (schemat z modelu, bez migracji Npgsql-specyficznych).

**Świadome ograniczenie MVP:** merge (read-modify-write) w EF nie jest atomowy jak `ConcurrentDictionary.AddOrUpdate` — przy prawdziwej równoległości konsumentów istnieje ryzyko lost-update. Akceptowalne przy pojedynczej instancji i niskim wolumenie; docelowo DB-upsert / token współbieżności / outbox (odłożone).

**Tech Stack:** .NET 10, C#, EF Core (Npgsql prod, SQLite in-memory test), MassTransit 8.5.10 (już), xUnit, Docker Compose (RabbitMQ jest; Postgres dochodzi).

## Global Constraints

- TargetFramework: `net10.0`; `TreatWarningsAsErrors=true`; stan wyjściowy: 168 testów zielonych
- EF Core: wybierz najnowszą stabilną kompatybilną z net10.0 (pakiety: `Microsoft.EntityFrameworkCore`, `Npgsql.EntityFrameworkCore.PostgreSQL`, `Microsoft.EntityFrameworkCore.Sqlite` dla testów, `Microsoft.EntityFrameworkCore.Design` dla migracji) — odnotuj wersje w raporcie
- Świeżość (wiążące): dane rynkowe świeże, gdy `now - LastWrittenAt <= 7 dni`; `GetAsync` dla nieświeżych zwraca `MarketDayData(null, null, [])` (→ fallback syntetyczny). `now` z wstrzykniętego `TimeProvider`
- Fallback pricing bez zmian (obłożenie 0.70; weekend piątek/sobota → demand 60 + `["weekend"]`, inaczej 50 + `[]`) — istniejące golden testy pricing MUSZĄ przechodzić bez zmiany oczekiwań
- Provider switch pricing: `DATABASE_URL` obecne → `EfMarketDataStore` (Npgsql, `Migrate()` na starcie); brak → `InMemoryMarketDataStore`
- Determinizm testów: EF na SQLite in-memory z jednym trzymanym otwartym połączeniem + `EnsureCreated`; brak realnego Postgresa i Dockera w `dotnet test`
- Drivery (`IReadOnlyList<string>`) w bazie: kolumna tekstowa JSON przez EF value converter (dialekt-agnostyczne — działa na SQLite i Postgres)
- Commit po każdym tasku; komunikaty `feat:`/`chore:`/`test:`/`refactor:`

---

### Task 1: `IMarketDataStore` async + refaktor read-path (bez DB, bez zmiany zachowania)

**Files:**
- Create: `services/pricing/src/Rezio.Pricing.Api/IMarketDataStore.cs`
- Modify: `services/pricing/src/Rezio.Pricing.Api/MarketDataStore.cs` (→ `InMemoryMarketDataStore : IMarketDataStore`, metody async)
- Modify: `services/pricing/src/Rezio.Pricing.Api/MarketDataConsumers.cs` (await async setterów)
- Modify: `services/pricing/src/Rezio.Pricing.Api/IListingStore.cs` (`MarketDays` → `MarketDaysAsync`)
- Modify: `services/pricing/src/Rezio.Pricing.Api/InMemoryListingStore.cs` (async, ctor bierze `IMarketDataStore`)
- Modify: `services/pricing/src/Rezio.Pricing.Api/PricePublisher.cs` (await `MarketDaysAsync`)
- Modify: `services/pricing/src/Rezio.Pricing.Api/Program.cs` (rejestracja `IMarketDataStore`→`InMemoryMarketDataStore`; endpoint GET async; `store.MarketDaysAsync`)
- Modify: `services/pricing/tests/Rezio.Pricing.Api.Tests/MarketDataStoreTests.cs` (await; `MarketDataStore`→`InMemoryMarketDataStore`; `MarketDays`→`MarketDaysAsync`)
- Modify: `services/pricing/tests/Rezio.Pricing.Api.Tests/MarketDataConsumersTests.cs` (`MarketDataStore`→`InMemoryMarketDataStore`; asercje `store.GetAsync(...)` await)
- Modify: `services/pricing/tests/Rezio.Pricing.Api.Tests/PricePublisherTests.cs` (`AddSingleton<MarketDataStore>`→`AddSingleton<IMarketDataStore, InMemoryMarketDataStore>`)

**Interfaces:**
- Produces:
  - `record MarketDayData(double? OccupancyRate, int? DemandScore, IReadOnlyList<string> DemandDrivers)` (bez zmian — `LastWrittenAt` dochodzi w Task 2)
  - `interface IMarketDataStore { Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct); Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct); Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct); }`
  - `class InMemoryMarketDataStore : IMarketDataStore` (logika merge jak dotąd, opakowana w `Task`)
  - `Task<IReadOnlyList<MarketDaySnapshot>> IListingStore.MarketDaysAsync(string listingId, DateOnly from, DateOnly to, CancellationToken ct)` (+ `FindSettings` bez zmian)

- [ ] **Step 1: Zmień testy na async (RED) — modyfikacje**

W `MarketDataStoreTests.cs`: zamień `new MarketDataStore()` → `new InMemoryMarketDataStore()`, każdą metodę testu na `async Task`, wywołania na `await store.SetStatsAsync(..., CancellationToken.None)` / `await store.GetAsync(..., CancellationToken.None)` / `await listings.MarketDaysAsync(..., CancellationToken.None)`. Wartości oczekiwane bez zmian.
W `MarketDataConsumersTests.cs`: `new MarketDataStore()` → `new InMemoryMarketDataStore()`, `store.Get(...)` → `await store.GetAsync(..., CancellationToken.None)` (metody testów async).
W `PricePublisherTests.cs`: `.AddSingleton<MarketDataStore>()` → `.AddSingleton<IMarketDataStore, InMemoryMarketDataStore>()`.

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Api.Tests`
Expected: FAIL — brak `InMemoryMarketDataStore`/async API

- [ ] **Step 3: Implementacja**

`IMarketDataStore.cs`:
```csharp
namespace Rezio.Pricing.Api;

public sealed record MarketDayData(double? OccupancyRate, int? DemandScore, IReadOnlyList<string> DemandDrivers);

public interface IMarketDataStore
{
    Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct);
    Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct);
    Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct);
}
```

`MarketDataStore.cs` (całość — zamiana; usuń rekord `MarketDayData` stąd, jest w IMarketDataStore.cs):
```csharp
using System.Collections.Concurrent;

namespace Rezio.Pricing.Api;

public sealed class InMemoryMarketDataStore : IMarketDataStore
{
    private static readonly IReadOnlyList<string> NoDrivers = [];
    private readonly ConcurrentDictionary<(string MarketId, DateOnly Date), MarketDayData> _data = new();

    public Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct)
    {
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(occupancyRate, null, NoDrivers),
            (_, existing) => existing with { OccupancyRate = occupancyRate });
        return Task.CompletedTask;
    }

    public Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct)
    {
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(null, score, drivers),
            (_, existing) => existing with { DemandScore = score, DemandDrivers = drivers });
        return Task.CompletedTask;
    }

    public Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct) =>
        Task.FromResult(_data.GetValueOrDefault((marketId, date)) ?? new MarketDayData(null, null, NoDrivers));
}
```

`MarketDataConsumers.cs` — konsumery await'ują async settery (przekazują `context.CancellationToken`):
```csharp
using MassTransit;
using Rezio.Contracts;

namespace Rezio.Pricing.Api;

public sealed class MarketStatsUpdatedConsumer(IMarketDataStore store, ILogger<MarketStatsUpdatedConsumer> logger)
    : IConsumer<MarketStatsUpdated>
{
    public async Task Consume(ConsumeContext<MarketStatsUpdated> context)
    {
        var msg = context.Message;
        foreach (var line in msg.Stats)
            await store.SetStatsAsync(msg.MarketId, line.Date, line.OccupancyRate, context.CancellationToken);
        logger.LogInformation("Market stats for {MarketId}: {Days} day(s) updated", msg.MarketId, msg.Stats.Count);
    }
}

public sealed class DemandScoreUpdatedConsumer(IMarketDataStore store, ILogger<DemandScoreUpdatedConsumer> logger)
    : IConsumer<DemandScoreUpdated>
{
    public async Task Consume(ConsumeContext<DemandScoreUpdated> context)
    {
        var msg = context.Message;
        foreach (var line in msg.Scores)
            await store.SetDemandAsync(msg.MarketId, line.Date, line.Score, line.Drivers, context.CancellationToken);
        logger.LogInformation("Demand scores for {MarketId}: {Days} day(s) updated", msg.MarketId, msg.Scores.Count);
    }
}
```

`IListingStore.cs`:
```csharp
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public interface IListingStore
{
    ListingSettings? FindSettings(string listingId);
    Task<IReadOnlyList<MarketDaySnapshot>> MarketDaysAsync(string listingId, DateOnly from, DateOnly to, CancellationToken ct);
}
```

`InMemoryListingStore.cs` (całość):
```csharp
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public sealed class InMemoryListingStore(IMarketDataStore marketData) : IListingStore
{
    private const string DemoMarketId = "mkt_gdansk";
    private static readonly ListingSettings Demo = new(350m, 200m, 800m, MarketType.Seaside);
    private static readonly IReadOnlyList<string> WeekendDrivers = ["weekend"];
    private static readonly IReadOnlyList<string> NoDrivers = [];

    public ListingSettings? FindSettings(string listingId) =>
        listingId == "lst_demo" ? Demo : null;

    public async Task<IReadOnlyList<MarketDaySnapshot>> MarketDaysAsync(
        string listingId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var days = new List<MarketDaySnapshot>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var weekend = d.DayOfWeek is DayOfWeek.Friday or DayOfWeek.Saturday;
            var data = await marketData.GetAsync(DemoMarketId, d, ct);

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

`PricePublisher.cs` — zmień `store.MarketDays(...)` na `await store.MarketDaysAsync(listingId, from, to, ct)` (metoda już async; wynik `.Select(...)` bez zmian).

`Program.cs`:
- rejestracja: `builder.Services.AddSingleton<IMarketDataStore, InMemoryMarketDataStore>();` (zamiast `AddSingleton<MarketDataStore>()`), przed `IListingStore`
- endpoint GET `/v1/listings/{id}/prices`: handler na `async`, dodaj `CancellationToken ct` do parametrów, `var prices = (await store.MarketDaysAsync(id, from, to, ct)).Select(day => PricingEngine.Recommend(settings, day, today)).ToList();`

- [ ] **Step 4: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS (168 — bez nowych; refaktor zachowuje zachowanie)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: async IMarketDataStore and read-path (no behavior change)"
```

---

### Task 2: Świeżość danych (`LastWrittenAt` + degradacja 7 dni)

**Files:**
- Modify: `services/pricing/src/Rezio.Pricing.Api/IMarketDataStore.cs` (dodaj `LastWrittenAt` do `MarketDayData`)
- Modify: `services/pricing/src/Rezio.Pricing.Api/MarketDataStore.cs` (`InMemoryMarketDataStore` bierze `TimeProvider`; stempluje zapisy; `GetAsync` filtruje świeżość)
- Modify: `services/pricing/src/Rezio.Pricing.Api/Program.cs` (store rozwiązuje `TimeProvider` — już zarejestrowany `TimeProvider.System`)
- Test: `services/pricing/tests/Rezio.Pricing.Api.Tests/MarketDataFreshnessTests.cs`
- Modify: `services/pricing/tests/Rezio.Pricing.Api.Tests/MarketDataStoreTests.cs` (konstruktor `new InMemoryMarketDataStore(TimeProvider.System)`; asercje driverów bez zmian; nowe pole `LastWrittenAt` ignorowane w istniejących asercjach)

**Interfaces:**
- Produces:
  - `record MarketDayData(double? OccupancyRate, int? DemandScore, IReadOnlyList<string> DemandDrivers, DateTimeOffset? LastWrittenAt)` — `Get` dla braku/nieświeżych: `LastWrittenAt = null`
  - `InMemoryMarketDataStore(TimeProvider clock)` — świeżość: rekord zwracany tylko gdy `clock.GetUtcNow() - LastWrittenAt <= 7 dni`, inaczej null-object

Uwaga: `MarketDataStore` przechowuje pełne rekordy ze stemplem; `GetAsync` decyduje o świeżości przy odczycie (nie kasuje starych — to zrobi porządkowanie/DB TTL później).

- [ ] **Step 1: Failing testy świeżości**

```csharp
using Microsoft.Extensions.Time.Testing;

namespace Rezio.Pricing.Api.Tests;

public class MarketDataFreshnessTests
{
    private static readonly DateOnly D = new(2026, 6, 4);

    [Fact]
    public async Task Fresh_data_within_seven_days_is_returned()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        var store = new InMemoryMarketDataStore(clock);
        await store.SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);

        clock.Advance(TimeSpan.FromDays(6));
        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(0.9, data.OccupancyRate);
    }

    [Fact]
    public async Task Stale_data_older_than_seven_days_degrades_to_null_object()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        var store = new InMemoryMarketDataStore(clock);
        await store.SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);
        await store.SetDemandAsync("mkt_gdansk", D, 75, ["Boże Ciało"], CancellationToken.None);

        clock.Advance(TimeSpan.FromDays(8));
        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Null(data.OccupancyRate);
        Assert.Null(data.DemandScore);
        Assert.Empty(data.DemandDrivers);
    }

    [Fact]
    public async Task Listing_store_uses_fallback_when_data_is_stale()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 9, 12, 0, 0, TimeSpan.Zero));
        var store = new InMemoryMarketDataStore(clock);
        var listings = new InMemoryListingStore(store);
        await store.SetStatsAsync("mkt_gdansk", new DateOnly(2026, 6, 9), 0.95, CancellationToken.None);

        clock.Advance(TimeSpan.FromDays(10));
        var day = (await listings.MarketDaysAsync("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9), CancellationToken.None)).Single();
        Assert.Equal(0.70, day.OccupancyRate); // fallback, bo dane nieświeże
    }
}
```

Do `.csproj` testów dołóż pakiet `Microsoft.Extensions.TimeProvider.Testing` (FakeTimeProvider) — najnowsza stabilna kompatybilna; odnotuj wersję.

- [ ] **Step 2: Uruchom — FAIL**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Api.Tests`
Expected: FAIL

- [ ] **Step 3: Implementacja**

`IMarketDataStore.cs` — rozszerz rekord:
```csharp
public sealed record MarketDayData(
    double? OccupancyRate,
    int? DemandScore,
    IReadOnlyList<string> DemandDrivers,
    DateTimeOffset? LastWrittenAt = null);
```

`MarketDataStore.cs` (`InMemoryMarketDataStore`):
```csharp
using System.Collections.Concurrent;

namespace Rezio.Pricing.Api;

public sealed class InMemoryMarketDataStore(TimeProvider clock) : IMarketDataStore
{
    private static readonly TimeSpan Freshness = TimeSpan.FromDays(7);
    private static readonly IReadOnlyList<string> NoDrivers = [];
    private readonly ConcurrentDictionary<(string MarketId, DateOnly Date), MarketDayData> _data = new();

    public Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(occupancyRate, null, NoDrivers, now),
            (_, existing) => existing with { OccupancyRate = occupancyRate, LastWrittenAt = now });
        return Task.CompletedTask;
    }

    public Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(null, score, drivers, now),
            (_, existing) => existing with { DemandScore = score, DemandDrivers = drivers, LastWrittenAt = now });
        return Task.CompletedTask;
    }

    public Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct)
    {
        var empty = new MarketDayData(null, null, NoDrivers);
        if (!_data.TryGetValue((marketId, date), out var record) || record.LastWrittenAt is null)
            return Task.FromResult(empty);

        var stale = clock.GetUtcNow() - record.LastWrittenAt.Value > Freshness;
        return Task.FromResult(stale ? empty : record);
    }
}
```

`Program.cs` — rejestracja z `TimeProvider`:
```csharp
builder.Services.AddSingleton<IMarketDataStore>(sp =>
    new InMemoryMarketDataStore(sp.GetRequiredService<TimeProvider>()));
```

W `MarketDataStoreTests.cs`: konstruktor `new InMemoryMarketDataStore(TimeProvider.System)` (świeżo zapisane dane są świeże wg zegara systemowego, więc istniejące asercje merge/fallback bez zmian).

- [ ] **Step 4: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: market data freshness — stale data (>7 days) degrades to synthetic fallback"
```

---

### Task 3: `EfMarketDataStore` (EF Core, testy na SQLite in-memory)

**Files:**
- Create: `services/pricing/src/Rezio.Pricing.Api/Persistence/PricingDbContext.cs`
- Create: `services/pricing/src/Rezio.Pricing.Api/Persistence/MarketDataRecord.cs`
- Create: `services/pricing/src/Rezio.Pricing.Api/Persistence/EfMarketDataStore.cs`
- Modify: `services/pricing/src/Rezio.Pricing.Api/Rezio.Pricing.Api.csproj` (EF Core + Npgsql + Design)
- Modify: `services/pricing/tests/Rezio.Pricing.Api.Tests/Rezio.Pricing.Api.Tests.csproj` (EF Core Sqlite)
- Test: `services/pricing/tests/Rezio.Pricing.Api.Tests/EfMarketDataStoreTests.cs`

**Interfaces:**
- Consumes: `IMarketDataStore`, `MarketDayData` (Task 1–2)
- Produces:
  - `class MarketDataRecord` (encja: `MarketId`, `Date`, `OccupancyRate?`, `DemandScore?`, `DemandDriversJson`, `LastWrittenAt`)
  - `class PricingDbContext : DbContext` z `DbSet<MarketDataRecord>`, klucz złożony `(MarketId, Date)`
  - `class EfMarketDataStore(PricingDbContext db, TimeProvider clock) : IMarketDataStore` — find-or-insert + merge; drivery serializowane JSON-em; `GetAsync` z tą samą regułą świeżości (7 dni)

- [ ] **Step 1: Pakiety**

```bash
dotnet add services/pricing/src/Rezio.Pricing.Api package Microsoft.EntityFrameworkCore
dotnet add services/pricing/src/Rezio.Pricing.Api package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add services/pricing/src/Rezio.Pricing.Api package Microsoft.EntityFrameworkCore.Design
dotnet add services/pricing/tests/Rezio.Pricing.Api.Tests package Microsoft.EntityFrameworkCore.Sqlite
```

- [ ] **Step 2: Failing testy (SQLite in-memory)**

```csharp
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;

namespace Rezio.Pricing.Api.Tests;

public class EfMarketDataStoreTests : IAsyncLifetime
{
    private SqliteConnection _conn = null!;
    private static readonly DateOnly D = new(2026, 6, 4);

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        await _conn.OpenAsync();
    }

    public async Task DisposeAsync() => await _conn.DisposeAsync();

    private PricingDbContext NewContext()
    {
        var options = new DbContextOptionsBuilder<PricingDbContext>().UseSqlite(_conn).Options;
        var ctx = new PricingDbContext(options);
        ctx.Database.EnsureCreated();
        return ctx;
    }

    [Fact]
    public async Task Persists_and_reads_back_merged_stats_and_demand()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        await using var ctx = NewContext();
        var store = new EfMarketDataStore(ctx, clock);

        await store.SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);
        await store.SetDemandAsync("mkt_gdansk", D, 75, ["Boże Ciało"], CancellationToken.None);

        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(0.9, data.OccupancyRate);
        Assert.Equal(75, data.DemandScore);
        Assert.Equal(["Boże Ciało"], data.DemandDrivers);
    }

    [Fact]
    public async Task Data_survives_a_new_context_over_same_connection()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        await using (var ctx1 = NewContext())
            await new EfMarketDataStore(ctx1, clock).SetStatsAsync("mkt_gdansk", D, 0.88, CancellationToken.None);

        await using var ctx2 = NewContext();
        var data = await new EfMarketDataStore(ctx2, clock).GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(0.88, data.OccupancyRate); // dane przetrwały (ta sama baza :memory: na wspólnym połączeniu)
    }

    [Fact]
    public async Task Stale_rows_degrade_to_null_object()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        await using var ctx = NewContext();
        var store = new EfMarketDataStore(ctx, clock);
        await store.SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);

        clock.Advance(TimeSpan.FromDays(8));
        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Null(data.OccupancyRate);
        Assert.Empty(data.DemandDrivers);
    }
}
```

- [ ] **Step 3: Uruchom — FAIL kompilacją**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Api.Tests`
Expected: FAIL

- [ ] **Step 4: Implementacja**

`Persistence/MarketDataRecord.cs`:
```csharp
namespace Rezio.Pricing.Api.Persistence;

public sealed class MarketDataRecord
{
    public required string MarketId { get; set; }
    public DateOnly Date { get; set; }
    public double? OccupancyRate { get; set; }
    public int? DemandScore { get; set; }
    public string DemandDriversJson { get; set; } = "[]";
    public DateTimeOffset LastWrittenAt { get; set; }
}
```

`Persistence/PricingDbContext.cs`:
```csharp
using Microsoft.EntityFrameworkCore;

namespace Rezio.Pricing.Api.Persistence;

public sealed class PricingDbContext(DbContextOptions<PricingDbContext> options) : DbContext(options)
{
    public DbSet<MarketDataRecord> MarketData => Set<MarketDataRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MarketDataRecord>(e =>
        {
            e.ToTable("market_data");
            e.HasKey(x => new { x.MarketId, x.Date });
            e.Property(x => x.MarketId).HasMaxLength(64);
        });
    }
}
```

`Persistence/EfMarketDataStore.cs`:
```csharp
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Rezio.Pricing.Api.Persistence;

public sealed class EfMarketDataStore(PricingDbContext db, TimeProvider clock) : IMarketDataStore
{
    private static readonly TimeSpan Freshness = TimeSpan.FromDays(7);
    private static readonly IReadOnlyList<string> NoDrivers = [];

    public async Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct)
    {
        var row = await db.MarketData.FindAsync([marketId, date], ct);
        if (row is null)
        {
            db.MarketData.Add(new MarketDataRecord
            {
                MarketId = marketId, Date = date, OccupancyRate = occupancyRate,
                DemandDriversJson = "[]", LastWrittenAt = clock.GetUtcNow()
            });
        }
        else
        {
            row.OccupancyRate = occupancyRate;
            row.LastWrittenAt = clock.GetUtcNow();
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(drivers);
        var row = await db.MarketData.FindAsync([marketId, date], ct);
        if (row is null)
        {
            db.MarketData.Add(new MarketDataRecord
            {
                MarketId = marketId, Date = date, DemandScore = score,
                DemandDriversJson = json, LastWrittenAt = clock.GetUtcNow()
            });
        }
        else
        {
            row.DemandScore = score;
            row.DemandDriversJson = json;
            row.LastWrittenAt = clock.GetUtcNow();
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct)
    {
        var empty = new MarketDayData(null, null, NoDrivers);
        var row = await db.MarketData.AsNoTracking()
            .FirstOrDefaultAsync(x => x.MarketId == marketId && x.Date == date, ct);
        if (row is null || clock.GetUtcNow() - row.LastWrittenAt > Freshness)
            return empty;

        var drivers = JsonSerializer.Deserialize<List<string>>(row.DemandDriversJson) ?? [];
        return new MarketDayData(row.OccupancyRate, row.DemandScore, drivers, row.LastWrittenAt);
    }
}
```

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: EF Core market data store with JSON drivers and freshness (SQLite-tested)"
```

---

### Task 4: Provider switch + migracja Npgsql + rejestracja w Program.cs

**Files:**
- Modify: `services/pricing/src/Rezio.Pricing.Api/Program.cs` (DATABASE_URL → EF/Npgsql + Migrate; brak → InMemory)
- Create: `services/pricing/src/Rezio.Pricing.Api/Migrations/*` (migracja EF dla Npgsql — generowana narzędziem)
- Test: `services/pricing/tests/Rezio.Pricing.Api.Tests/StoreSelectionTests.cs`

**Interfaces:**
- Produces: rejestracja warunkowa store'a; migracja Npgsql aplikowana na starcie gdy `DATABASE_URL`

- [ ] **Step 1: Failing test (selekcja store'a wg konfiguracji)**

Test sprawdza czystą funkcję selekcji, bez realnej bazy:

```csharp
namespace Rezio.Pricing.Api.Tests;

public class StoreSelectionTests
{
    [Fact]
    public void No_database_url_selects_in_memory_store()
    {
        Assert.False(StoreSelection.UsesPostgres(null));
        Assert.False(StoreSelection.UsesPostgres(""));
        Assert.False(StoreSelection.UsesPostgres("   "));
    }

    [Fact]
    public void Database_url_selects_postgres_store()
    {
        Assert.True(StoreSelection.UsesPostgres("Host=localhost;Database=rezio;Username=rezio;Password=x"));
    }
}
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Api.Tests`
Expected: FAIL — brak `StoreSelection`

- [ ] **Step 3: Implementacja — helper + rejestracja**

Create `services/pricing/src/Rezio.Pricing.Api/StoreSelection.cs`:
```csharp
namespace Rezio.Pricing.Api;

public static class StoreSelection
{
    public static bool UsesPostgres(string? databaseUrl) => !string.IsNullOrWhiteSpace(databaseUrl);
}
```

W `Program.cs` — zastąp rejestrację store'a warunkiem:
```csharp
var databaseUrl = builder.Configuration["DATABASE_URL"];
if (StoreSelection.UsesPostgres(databaseUrl))
{
    builder.Services.AddDbContext<Rezio.Pricing.Api.Persistence.PricingDbContext>(o => o.UseNpgsql(databaseUrl));
    builder.Services.AddScoped<IMarketDataStore, Rezio.Pricing.Api.Persistence.EfMarketDataStore>();
}
else
{
    builder.Services.AddSingleton<IMarketDataStore>(sp =>
        new InMemoryMarketDataStore(sp.GetRequiredService<TimeProvider>()));
}
```
Dodaj `using Microsoft.EntityFrameworkCore;`.

**Uwaga lifetime:** przy Postgresie `IMarketDataStore` musi być Scoped (DbContext jest scoped), a `IListingStore`/`PricePublisher`, które go konsumują, też muszą być Scoped w tym wariancie. Zmień rejestracje `IListingStore` i `PricePublisher` na `AddScoped` (działa też dla wariantu in-memory — singleton store wstrzykiwany do scoped konsumenta jest poprawny). Konsumery MassTransit są i tak scoped per-message.

Po `var app = builder.Build();` (gdy Postgres) zastosuj migrację:
```csharp
if (StoreSelection.UsesPostgres(databaseUrl))
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<Rezio.Pricing.Api.Persistence.PricingDbContext>().Database.Migrate();
}
```

- [ ] **Step 4: Wygeneruj migrację Npgsql**

Wymaga `dotnet-ef` (zainstaluj lokalnie jeśli brak: `dotnet tool install --global dotnet-ef` lub użyj `dotnet ef` gdy dostępne). Migrację generuje się z DATABASE_URL wskazującym Npgsql (design-time), ale bez połączenia — użyj `--no-build` po wcześniejszym buildzie i design-time factory jeśli potrzebne. Najprostsze: dodaj **design-time factory**, żeby `dotnet ef` wiedział jak zbudować kontekst:

Create `services/pricing/src/Rezio.Pricing.Api/Persistence/PricingDbContextFactory.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Rezio.Pricing.Api.Persistence;

public sealed class PricingDbContextFactory : IDesignTimeDbContextFactory<PricingDbContext>
{
    public PricingDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<PricingDbContext>()
            .UseNpgsql("Host=localhost;Database=rezio;Username=rezio;Password=rezio")
            .Options;
        return new PricingDbContext(options);
    }
}
```

Następnie:
```bash
dotnet ef migrations add InitialMarketData --project services/pricing/src/Rezio.Pricing.Api --output-dir Migrations
```
Sprawdź, że migracja tworzy tabelę `market_data` z kluczem złożonym. (Jeśli `dotnet ef` niedostępne w środowisku — zgłoś BLOCKED z tą informacją; migracja jest wymagana do produkcji, ale reszta zadania i testy SQLite `EnsureCreated` działają bez niej.)

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS (SQLite-owe testy EF nie zależą od migracji Npgsql — używają `EnsureCreated`)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: select Postgres store via DATABASE_URL, apply EF migration on startup"
```

---

### Task 5: Postgres w compose + wiring pricing + README + e2e (trwałość + świeżość)

**Files:**
- Modify: `docker-compose.yml` (serwis `postgres` + `DATABASE_URL` dla pricing-api + `depends_on` postgres healthy)
- Modify: `README.md` (wiersz Postgres + nota o trwałości/świeżości)

**Interfaces:**
- Produces: pricing na Postgresie na żywym stosie; dane rynkowe przetrwają restart kontenera pricing

- [ ] **Step 1: Serwis `postgres` w `docker-compose.yml`**

```yaml
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: rezio
      POSTGRES_PASSWORD: rezio
      POSTGRES_DB: rezio
    ports:
      - "5432:5432"
    volumes:
      - rezio-pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rezio"]
      interval: 10s
      timeout: 5s
      retries: 5
```

Dodaj też na końcu pliku sekcję wolumenów (jeśli brak):
```yaml
volumes:
  rezio-pg:
```

- [ ] **Step 2: Podłącz pricing-api**

W bloku `pricing-api`: dodaj do `environment` `DATABASE_URL: Host=postgres;Database=rezio;Username=rezio;Password=rezio` oraz do `depends_on` mapę `postgres: { condition: service_healthy }` (obok istniejących loki/rabbitmq).

- [ ] **Step 3: README — wiersz i nota**

Dodaj wiersz w tabeli usług:
```markdown
| Postgres | localhost:5432 (rezio/rezio) — trwałe dane rynkowe pricing |
```
Oraz notę pod sekcją przepływu danych:
```markdown
Dane rynkowe pricing są trwałe (Postgres) — przeżywają restart kontenera. Dane starsze niż 7 dni degradują się do fallbacku syntetycznego (świeżość, spec §6). Bez `DATABASE_URL` pricing używa pamięci ulotnej.
```

- [ ] **Step 4: Odpal cały system i zweryfikuj trwałość + świeżość**

Run: `docker compose up --build -d`, poczekaj aż postgres i rabbitmq healthy, potem (pricing przez host :8080 albo override portu scratchpad, nie commitowany):
- `POST :8082/v1/scrape-jobs {"market_id":"mkt_gdansk","from":"2026-06-04","to":"2026-06-10"}` → 200
- `POST :8081/v1/markets/mkt_gdansk/publish-demand {"from":"2026-06-04","to":"2026-06-10"}` → 202
- `GET pricing /v1/listings/lst_demo/prices?from=2026-06-04&to=2026-06-10` → dane z eventów (obłożenie ≠ 0.70, drivery „Boże Ciało")
- **Test trwałości:** `docker compose restart pricing-api`, poczekaj aż wstanie; ponów `GET prices` dla tego samego zakresu → dane rynkowe DALEJ obecne (przetrwały restart — dowód Postgresa; in-memory by je stracił)
- w Postgresie: `docker compose exec postgres psql -U rezio -d rezio -c "select market_id, count(*) from market_data group by market_id;"` → wiersze dla `mkt_gdansk`
- HealthChecks UI: 4 serwisy Healthy; `docker compose down` (bez `-v`, żeby nie kasować wolumenu; wolumen zostaje między uruchomieniami)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add Postgres to compose; persist pricing market data across restarts"
```

---

## Poza zakresem tego planu (kolejne plany)

- Persystencja pozostałych serwisów (scraper: scraped_listing_daily/market_daily_stats; channel-sync: connections; demand jest bezstanowy) — analogiczny wzorzec
- Atomowy upsert / token współbieżności / MassTransit Transactional Outbox (obecnie merge read-modify-write ma ryzyko lost-update przy równoległości)
- Porządkowanie starych wierszy (TTL/partycjonowanie) — świeżość liczona przy odczycie, ale wiersze zostają
- Mapowanie oferta→rynek jako tabela (teraz stała `lst_demo`→`mkt_gdansk`)
- api-gateway + auth; realne adaptery scrapingu/CM
