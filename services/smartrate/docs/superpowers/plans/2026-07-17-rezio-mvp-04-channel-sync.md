# Rezio MVP — Plan 4: channel-sync (adaptery channel managerów, bezpieczny push cen)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Czwarty mikroserwis `channel-sync`: wspólna abstrakcja `IChannelAdapter` (pull ofert, pull rezerwacji, push cen) z deterministycznym adapterem syntetycznym, bezpieczny push cen (pełny kalendarz albo nic + retry z backoffem) i API do podpięcia połączenia i wyzwolenia synchronizacji.

**Architecture:** Lustrzana do pricing/demand/scraper. Czysta domena `Rezio.ChannelSync.Domain`: `IChannelAdapter` + `SyntheticChannelAdapter` (bez sieci, bez `Random`), `RatePlanValidator` (pełny kalendarz albo nic — pure), `BackoffPolicy` (pure, sekwencja opóźnień), `RatePushService` (retry na wstrzykiwanym opóźnieniu — testowalny bez realnego czekania), `ConnectionRegistry` + `SyncRunner`. API `Rezio.ChannelSync.Api`. **Prawdziwe adaptery Beds24/Smoobu/Hostaway wejdą później za tę samą abstrakcję** (wymagają kluczy API/partnerstwa — poza tym planem); dzięki temu cały serwis jest deterministyczny i testowalny w CI.

**Kluczowa zasada domenowa:** push cen jest atomowy i bezpieczny — albo idzie komplet cen na cały żądany zakres dat (bez luk i duplikatów), albo nic; przy błędzie adaptera ponawiamy z rosnącym backoffem, a po wyczerpaniu prób zwracamy trwały błąd połączenia (przyszły event `connection.error`).

**Tech Stack:** .NET 10, C#, ASP.NET Core minimal APIs, xUnit, Microsoft.AspNetCore.Mvc.Testing, Serilog (+ sink Loki), ASP.NET Core HealthChecks, Docker Compose.

## Global Constraints

- TargetFramework: `net10.0` (dziedziczone z `Directory.Build.props`); `TreatWarningsAsErrors=true`
- Testy: xUnit; komenda: `dotnet test`; obecny stan wyjściowy: 108 testów zielonych
- JSON w API: snake_case (`JsonNamingPolicy.SnakeCaseLower`), błędy problem+json
- Daty: `DateOnly`; determinizm: w domenie ZERO `Random`, `DateTime.Now`, `Guid.NewGuid`, ZERO realnego `Task.Delay` w testowanej ścieżce (opóźnienie retry wstrzykiwane jako `Func<TimeSpan, CancellationToken, Task>`, w testach no-op)
- Pieniądze: `decimal`, PLN
- Układ: `services/channelsync/src/*`, `services/channelsync/tests/*`; dopisanie do `Rezio.slnx`
- Limit zakresu dat: `to < from || to.DayNumber - from.DayNumber >= 365` → 400 (spójnie z pozostałymi serwisami)
- Providerzy (enum): `Beds24, Smoobu, Hostaway` — realne adaptery poza tym planem; syntetyczny obsługuje wszystkich
- Rejestr połączeń in-memory; identyfikatory połączeń `con_{provider_lower}_{n}` (deterministyczny licznik, patrz Task 5)
- Bezpieczeństwo push (wiążące): `RatePlanValidator` odrzuca zestaw cen, jeśli nie pokrywa DOKŁADNIE każdej daty w `[from, to]` (brak luk), zawiera duplikat daty, datę spoza zakresu, albo cenę `<= 0`
- Backoff (wiążące): `BackoffPolicy.Delays(maxAttempts)` = sekwencja `maxAttempts-1` opóźnień między próbami: `1s, 2s, 4s, 8s, …` (exponencjalne, `2^k` sekund, k=0..), capped na `30s`. Dla `maxAttempts <= 1` → pusta sekwencja
- Push (wiążące): próbuj do `maxAttempts` razy; sukces → `PushOutcome.Success(attemptsUsed)`; wyczerpanie prób → `PushOutcome.Failed(attemptsUsed, lastError)`; NIE wykonuj częściowego pushu (walidacja przed pierwszą próbą)
- Commit po każdym tasku; komunikaty `feat:`/`chore:`/`test:`

---

### Task 1: Scaffold projektów channel-sync

**Files:**
- Create (szablonami): `services/channelsync/src/Rezio.ChannelSync.Domain/`, `services/channelsync/src/Rezio.ChannelSync.Api/`, `services/channelsync/tests/Rezio.ChannelSync.Domain.Tests/`, `services/channelsync/tests/Rezio.ChannelSync.Api.Tests/`
- Modify: `Rezio.slnx`

**Interfaces:**
- Consumes: `Rezio.slnx`, `Directory.Build.props`
- Produces: budowalne 4 projekty

- [ ] **Step 1: Utwórz projekty i podepnij do solucji**

```bash
dotnet new classlib -n Rezio.ChannelSync.Domain -o services/channelsync/src/Rezio.ChannelSync.Domain
dotnet new web      -n Rezio.ChannelSync.Api    -o services/channelsync/src/Rezio.ChannelSync.Api
dotnet new xunit    -n Rezio.ChannelSync.Domain.Tests -o services/channelsync/tests/Rezio.ChannelSync.Domain.Tests
dotnet new xunit    -n Rezio.ChannelSync.Api.Tests    -o services/channelsync/tests/Rezio.ChannelSync.Api.Tests
dotnet sln Rezio.slnx add services/channelsync/src/Rezio.ChannelSync.Domain services/channelsync/src/Rezio.ChannelSync.Api services/channelsync/tests/Rezio.ChannelSync.Domain.Tests services/channelsync/tests/Rezio.ChannelSync.Api.Tests
dotnet add services/channelsync/src/Rezio.ChannelSync.Api reference services/channelsync/src/Rezio.ChannelSync.Domain
dotnet add services/channelsync/tests/Rezio.ChannelSync.Domain.Tests reference services/channelsync/src/Rezio.ChannelSync.Domain
dotnet add services/channelsync/tests/Rezio.ChannelSync.Api.Tests reference services/channelsync/src/Rezio.ChannelSync.Api
dotnet add services/channelsync/tests/Rezio.ChannelSync.Api.Tests package Microsoft.AspNetCore.Mvc.Testing
```

- [ ] **Step 2: Wyczyść szablony (wzorzec z planów 1–3)**

Usuń `Class1.cs` z Domain. Z czterech nowych `.csproj` usuń zduplikowane `<TargetFramework>`, `<Nullable>`, `<ImplicitUsings>` i puste `<PropertyGroup>` (jak w `services/scraper/src/Rezio.Scraper.Domain/Rezio.Scraper.Domain.csproj`). Zostaw `UnitTest1.cs` w obu projektach testowych. Newline na końcu każdego `.csproj`.

- [ ] **Step 3: Zbuduj i odpal testy**

Run: `dotnet build && dotnet test`
Expected: build OK; 110 testów PASS (108 + 2 smoke)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold channel-sync service skeleton"
```

---

### Task 2: Modele domenowe + abstrakcja `IChannelAdapter`

**Files:**
- Create: `services/channelsync/src/Rezio.ChannelSync.Domain/ChannelProvider.cs`
- Create: `services/channelsync/src/Rezio.ChannelSync.Domain/ChannelModels.cs`
- Create: `services/channelsync/src/Rezio.ChannelSync.Domain/IChannelAdapter.cs`
- Test: `services/channelsync/tests/Rezio.ChannelSync.Domain.Tests/ChannelModelsTests.cs`
- Delete: `services/channelsync/tests/Rezio.ChannelSync.Domain.Tests/UnitTest1.cs`

**Interfaces:**
- Consumes: nic
- Produces:
  - `enum ChannelProvider { Beds24, Smoobu, Hostaway }`
  - `record ChannelListing(string ExternalId, string Title, string MarketId)`
  - `record Reservation(string ExternalListingId, DateOnly CheckIn, DateOnly CheckOut, decimal TotalPrice)`
  - `record RateUpdate(DateOnly Date, decimal Price)`
  - `interface IChannelAdapter { ChannelProvider Provider { get; } Task<IReadOnlyList<ChannelListing>> PullListingsAsync(CancellationToken ct); Task<IReadOnlyList<Reservation>> PullReservationsAsync(DateOnly from, DateOnly to, CancellationToken ct); Task PushRatesAsync(string externalListingId, IReadOnlyList<RateUpdate> rates, CancellationToken ct); }`

- [ ] **Step 1: Failing test (kontrakt modeli — konstrukcja i równość rekordów)**

```csharp
using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class ChannelModelsTests
{
    [Fact]
    public void Rate_update_records_compare_by_value()
    {
        var a = new RateUpdate(new DateOnly(2026, 8, 1), 350m);
        var b = new RateUpdate(new DateOnly(2026, 8, 1), 350m);
        Assert.Equal(a, b);
    }

    [Fact]
    public void Channel_listing_carries_market_binding()
    {
        var l = new ChannelListing("ext-1", "Apartament", "mkt_krakow");
        Assert.Equal("mkt_krakow", l.MarketId);
    }

    [Fact]
    public void Reservation_holds_stay_dates_and_price()
    {
        var r = new Reservation("ext-1", new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 5), 1400m);
        Assert.Equal(4, r.CheckOut.DayNumber - r.CheckIn.DayNumber);
        Assert.Equal(1400m, r.TotalPrice);
    }

    [Fact]
    public void Providers_are_three_known_channel_managers()
    {
        Assert.Equal(3, Enum.GetValues<ChannelProvider>().Length);
        Assert.Contains(ChannelProvider.Beds24, Enum.GetValues<ChannelProvider>());
        Assert.Contains(ChannelProvider.Smoobu, Enum.GetValues<ChannelProvider>());
        Assert.Contains(ChannelProvider.Hostaway, Enum.GetValues<ChannelProvider>());
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/channelsync/tests/Rezio.ChannelSync.Domain.Tests`
Expected: FAIL — brak typów

- [ ] **Step 3: Implementacja**

`ChannelProvider.cs`:
```csharp
namespace Rezio.ChannelSync.Domain;

public enum ChannelProvider { Beds24, Smoobu, Hostaway }
```

`ChannelModels.cs`:
```csharp
namespace Rezio.ChannelSync.Domain;

public sealed record ChannelListing(string ExternalId, string Title, string MarketId);

public sealed record Reservation(
    string ExternalListingId,
    DateOnly CheckIn,
    DateOnly CheckOut,
    decimal TotalPrice);

public sealed record RateUpdate(DateOnly Date, decimal Price);
```

`IChannelAdapter.cs`:
```csharp
namespace Rezio.ChannelSync.Domain;

public interface IChannelAdapter
{
    ChannelProvider Provider { get; }
    Task<IReadOnlyList<ChannelListing>> PullListingsAsync(CancellationToken ct);
    Task<IReadOnlyList<Reservation>> PullReservationsAsync(DateOnly from, DateOnly to, CancellationToken ct);
    Task PushRatesAsync(string externalListingId, IReadOnlyList<RateUpdate> rates, CancellationToken ct);
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/channelsync/tests/Rezio.ChannelSync.Domain.Tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: channel adapter abstraction and domain models"
```

---

### Task 3: `RatePlanValidator` — pełny kalendarz albo nic

**Files:**
- Create: `services/channelsync/src/Rezio.ChannelSync.Domain/RatePlanValidator.cs`
- Test: `services/channelsync/tests/Rezio.ChannelSync.Domain.Tests/RatePlanValidatorTests.cs`

**Interfaces:**
- Consumes: `RateUpdate` (Task 2)
- Produces:
  - `record RatePlanValidation(bool IsValid, string? Error)`
  - `static RatePlanValidation RatePlanValidator.Validate(IReadOnlyList<RateUpdate> rates, DateOnly from, DateOnly to)` — waliduje: każda data w `[from,to]` obecna dokładnie raz, brak dat spoza zakresu, brak cen `<= 0`

Reguły błędów (wiążące — pierwszy pasujący komunikat):
- pusta lista lub `null` → `"empty rate plan"`
- jakakolwiek cena `<= 0` → `"non-positive price"`
- data spoza `[from,to]` → `"date out of range"`
- duplikat daty → `"duplicate date"`
- brakująca data w zakresie (liczność ≠ liczba dni) → `"incomplete calendar coverage"`
- w porządku → `IsValid=true, Error=null`

- [ ] **Step 1: Failing testy**

```csharp
using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class RatePlanValidatorTests
{
    private static readonly DateOnly From = new(2026, 8, 1);
    private static readonly DateOnly To = new(2026, 8, 3);

    private static RateUpdate R(int day, decimal price) => new(new DateOnly(2026, 8, day), price);

    [Fact]
    public void Full_contiguous_coverage_is_valid()
    {
        var result = RatePlanValidator.Validate([R(1, 300m), R(2, 320m), R(3, 310m)], From, To);
        Assert.True(result.IsValid);
        Assert.Null(result.Error);
    }

    [Fact]
    public void Unordered_but_complete_is_valid()
    {
        var result = RatePlanValidator.Validate([R(3, 310m), R(1, 300m), R(2, 320m)], From, To);
        Assert.True(result.IsValid);
    }

    [Fact]
    public void Empty_is_invalid()
    {
        var result = RatePlanValidator.Validate([], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("empty rate plan", result.Error);
    }

    [Fact]
    public void Missing_day_is_incomplete()
    {
        var result = RatePlanValidator.Validate([R(1, 300m), R(3, 310m)], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("incomplete calendar coverage", result.Error);
    }

    [Fact]
    public void Duplicate_day_is_rejected()
    {
        var result = RatePlanValidator.Validate([R(1, 300m), R(1, 320m), R(3, 310m)], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("duplicate date", result.Error);
    }

    [Fact]
    public void Date_out_of_range_is_rejected()
    {
        var result = RatePlanValidator.Validate([R(1, 300m), R(2, 320m), R(5, 310m)], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("date out of range", result.Error);
    }

    [Fact]
    public void Non_positive_price_is_rejected()
    {
        var result = RatePlanValidator.Validate([R(1, 0m), R(2, 320m), R(3, 310m)], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("non-positive price", result.Error);
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/channelsync/tests/Rezio.ChannelSync.Domain.Tests`
Expected: FAIL

- [ ] **Step 3: Implementacja**

`RatePlanValidator.cs`:
```csharp
namespace Rezio.ChannelSync.Domain;

public sealed record RatePlanValidation(bool IsValid, string? Error);

public static class RatePlanValidator
{
    public static RatePlanValidation Validate(IReadOnlyList<RateUpdate> rates, DateOnly from, DateOnly to)
    {
        if (rates is null || rates.Count == 0)
            return new RatePlanValidation(false, "empty rate plan");

        if (rates.Any(r => r.Price <= 0))
            return new RatePlanValidation(false, "non-positive price");

        if (rates.Any(r => r.Date < from || r.Date > to))
            return new RatePlanValidation(false, "date out of range");

        var distinctDates = rates.Select(r => r.Date).ToHashSet();
        if (distinctDates.Count != rates.Count)
            return new RatePlanValidation(false, "duplicate date");

        var expectedDays = to.DayNumber - from.DayNumber + 1;
        if (rates.Count != expectedDays)
            return new RatePlanValidation(false, "incomplete calendar coverage");

        return new RatePlanValidation(true, null);
    }
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/channelsync/tests/Rezio.ChannelSync.Domain.Tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rate plan validator (full-calendar-or-nothing safety)"
```

---

### Task 4: `BackoffPolicy` + `RatePushService` (retry na wstrzykiwanym opóźnieniu)

**Files:**
- Create: `services/channelsync/src/Rezio.ChannelSync.Domain/BackoffPolicy.cs`
- Create: `services/channelsync/src/Rezio.ChannelSync.Domain/RatePushService.cs`
- Test: `services/channelsync/tests/Rezio.ChannelSync.Domain.Tests/BackoffPolicyTests.cs`
- Test: `services/channelsync/tests/Rezio.ChannelSync.Domain.Tests/RatePushServiceTests.cs`

**Interfaces:**
- Consumes: `IChannelAdapter`, `RateUpdate`, `RatePlanValidator` (Taski 2–3)
- Produces:
  - `static IReadOnlyList<TimeSpan> BackoffPolicy.Delays(int maxAttempts)` — `maxAttempts-1` opóźnień, `2^k` s capped na 30 s
  - `abstract record PushOutcome` z `Success(int AttemptsUsed)` i `Failed(int AttemptsUsed, string LastError)` (użyj `sealed record`y dziedziczące)
  - `class RatePushService(Func<TimeSpan, CancellationToken, Task> delay)` z metodą `Task<PushOutcome> PushAsync(IChannelAdapter adapter, string externalListingId, IReadOnlyList<RateUpdate> rates, DateOnly from, DateOnly to, int maxAttempts, CancellationToken ct)` — najpierw walidacja (fail → `Failed(0, error)` bez próby), potem do `maxAttempts` prób z opóźnieniami z `BackoffPolicy`

- [ ] **Step 1: Failing testy BackoffPolicy**

```csharp
using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class BackoffPolicyTests
{
    [Fact]
    public void Single_attempt_has_no_delays()
    {
        Assert.Empty(BackoffPolicy.Delays(1));
    }

    [Fact]
    public void Delays_are_exponential_seconds()
    {
        var delays = BackoffPolicy.Delays(4);
        Assert.Equal(3, delays.Count);
        Assert.Equal(TimeSpan.FromSeconds(1), delays[0]);
        Assert.Equal(TimeSpan.FromSeconds(2), delays[1]);
        Assert.Equal(TimeSpan.FromSeconds(4), delays[2]);
    }

    [Fact]
    public void Delays_are_capped_at_thirty_seconds()
    {
        var delays = BackoffPolicy.Delays(10);
        Assert.All(delays, d => Assert.True(d <= TimeSpan.FromSeconds(30)));
        Assert.Equal(TimeSpan.FromSeconds(30), delays[^1]);
    }
}
```

- [ ] **Step 2: Failing testy RatePushService**

```csharp
using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class RatePushServiceTests
{
    private static readonly DateOnly From = new(2026, 8, 1);
    private static readonly DateOnly To = new(2026, 8, 2);
    private static readonly IReadOnlyList<RateUpdate> ValidRates =
        [new(new DateOnly(2026, 8, 1), 300m), new(new DateOnly(2026, 8, 2), 320m)];

    // Adapter, który failuje pierwsze N wywołań push, potem sukces; liczy próby.
    private sealed class FlakyAdapter(int failuresBeforeSuccess) : IChannelAdapter
    {
        public int PushAttempts { get; private set; }
        public ChannelProvider Provider => ChannelProvider.Beds24;
        public Task<IReadOnlyList<ChannelListing>> PullListingsAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<ChannelListing>>([]);
        public Task<IReadOnlyList<Reservation>> PullReservationsAsync(DateOnly from, DateOnly to, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<Reservation>>([]);
        public Task PushRatesAsync(string externalListingId, IReadOnlyList<RateUpdate> rates, CancellationToken ct)
        {
            PushAttempts++;
            if (PushAttempts <= failuresBeforeSuccess)
                throw new InvalidOperationException($"channel error {PushAttempts}");
            return Task.CompletedTask;
        }
    }

    private static RatePushService NoDelayService() => new((_, _) => Task.CompletedTask);

    [Fact]
    public async Task Successful_push_on_first_attempt()
    {
        var adapter = new FlakyAdapter(0);
        var outcome = await NoDelayService().PushAsync(adapter, "ext-1", ValidRates, From, To, maxAttempts: 3, default);

        var success = Assert.IsType<PushOutcome.Success>(outcome);
        Assert.Equal(1, success.AttemptsUsed);
        Assert.Equal(1, adapter.PushAttempts);
    }

    [Fact]
    public async Task Retries_then_succeeds()
    {
        var adapter = new FlakyAdapter(2);
        var outcome = await NoDelayService().PushAsync(adapter, "ext-1", ValidRates, From, To, maxAttempts: 3, default);

        var success = Assert.IsType<PushOutcome.Success>(outcome);
        Assert.Equal(3, success.AttemptsUsed);
        Assert.Equal(3, adapter.PushAttempts);
    }

    [Fact]
    public async Task Exhausts_attempts_then_fails()
    {
        var adapter = new FlakyAdapter(99);
        var outcome = await NoDelayService().PushAsync(adapter, "ext-1", ValidRates, From, To, maxAttempts: 3, default);

        var failed = Assert.IsType<PushOutcome.Failed>(outcome);
        Assert.Equal(3, failed.AttemptsUsed);
        Assert.Equal(3, adapter.PushAttempts);
        Assert.Contains("channel error", failed.LastError);
    }

    [Fact]
    public async Task Invalid_plan_fails_without_calling_adapter()
    {
        var adapter = new FlakyAdapter(0);
        var partial = new[] { new RateUpdate(new DateOnly(2026, 8, 1), 300m) }; // brak 08-02
        var outcome = await NoDelayService().PushAsync(adapter, "ext-1", partial, From, To, maxAttempts: 3, default);

        var failed = Assert.IsType<PushOutcome.Failed>(outcome);
        Assert.Equal(0, failed.AttemptsUsed);
        Assert.Equal(0, adapter.PushAttempts);
        Assert.Equal("incomplete calendar coverage", failed.LastError);
    }
}
```

- [ ] **Step 3: Uruchom — FAIL kompilacją**

Run: `dotnet test services/channelsync/tests/Rezio.ChannelSync.Domain.Tests`
Expected: FAIL

- [ ] **Step 4: Implementacja**

`BackoffPolicy.cs`:
```csharp
namespace Rezio.ChannelSync.Domain;

public static class BackoffPolicy
{
    private static readonly TimeSpan Cap = TimeSpan.FromSeconds(30);

    public static IReadOnlyList<TimeSpan> Delays(int maxAttempts)
    {
        var delays = new List<TimeSpan>();
        for (var k = 0; k < maxAttempts - 1; k++)
        {
            var seconds = Math.Min(Math.Pow(2, k), Cap.TotalSeconds);
            delays.Add(TimeSpan.FromSeconds(seconds));
        }
        return delays;
    }
}
```

`RatePushService.cs`:
```csharp
namespace Rezio.ChannelSync.Domain;

public abstract record PushOutcome
{
    public sealed record Success(int AttemptsUsed) : PushOutcome;
    public sealed record Failed(int AttemptsUsed, string LastError) : PushOutcome;
}

public sealed class RatePushService(Func<TimeSpan, CancellationToken, Task> delay)
{
    public async Task<PushOutcome> PushAsync(
        IChannelAdapter adapter,
        string externalListingId,
        IReadOnlyList<RateUpdate> rates,
        DateOnly from,
        DateOnly to,
        int maxAttempts,
        CancellationToken ct)
    {
        var validation = RatePlanValidator.Validate(rates, from, to);
        if (!validation.IsValid)
            return new PushOutcome.Failed(0, validation.Error!);

        var delays = BackoffPolicy.Delays(maxAttempts);
        string lastError = "";

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                await adapter.PushRatesAsync(externalListingId, rates, ct);
                return new PushOutcome.Success(attempt);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                lastError = ex.Message;
                if (attempt < maxAttempts)
                    await delay(delays[attempt - 1], ct);
            }
        }

        return new PushOutcome.Failed(maxAttempts, lastError);
    }
}
```

- [ ] **Step 5: Testy zielone**

Run: `dotnet test services/channelsync/tests/Rezio.ChannelSync.Domain.Tests`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: backoff policy and rate push service with retry"
```

---

### Task 5: `SyntheticChannelAdapter`, `ConnectionRegistry`, `SyncRunner`

**Files:**
- Create: `services/channelsync/src/Rezio.ChannelSync.Domain/SyntheticChannelAdapter.cs`
- Create: `services/channelsync/src/Rezio.ChannelSync.Domain/ConnectionRegistry.cs`
- Create: `services/channelsync/src/Rezio.ChannelSync.Domain/SyncRunner.cs`
- Test: `services/channelsync/tests/Rezio.ChannelSync.Domain.Tests/SyntheticChannelAdapterTests.cs`
- Test: `services/channelsync/tests/Rezio.ChannelSync.Domain.Tests/SyncRunnerTests.cs`

**Interfaces:**
- Consumes: `IChannelAdapter`, `ChannelListing`, `Reservation`, `RateUpdate`, `ChannelProvider` (Task 2)
- Produces:
  - `class SyntheticChannelAdapter(ChannelProvider provider) : IChannelAdapter` — deterministyczne 5 ofert (`ExternalId = $"{provider_lower}-listing-{i}"`, i=1..5; `MarketId` cyklicznie z `["mkt_zakopane","mkt_gdansk","mkt_krakow","mkt_warszawa"]` po `(i-1)%4`; `Title = $"{Provider} listing {i}"`); `PullReservationsAsync` zwraca po jednej rezerwacji na ofertę, jeśli `from <= CheckIn`: `CheckIn = from.AddDays(i)`, `CheckOut = CheckIn.AddDays(2)`, `TotalPrice = 200 + i*50`; `PushRatesAsync` zapisuje ostatni pushnięty plan do `LastPushedRates` (do asercji), nie rzuca
  - `record Connection(string Id, ChannelProvider Provider, string Status)` (Status: `"connected"`)
  - `class ConnectionRegistry` — `Connection Add(ChannelProvider provider)` (deterministyczne id `con_{provider_lower}_{n}`, n rośnie od 1 per provider), `Connection? Find(string id)`, `IReadOnlyList<Connection> All()`
  - `record SyncResult(string ConnectionId, int ListingsPulled, int ReservationsPulled)`
  - `class SyncRunner` — `Task<SyncResult> SyncAsync(IChannelAdapter adapter, string connectionId, DateOnly from, DateOnly to, CancellationToken ct)` (pull listings + pull reservations, zwróć liczności)

- [ ] **Step 1: Failing testy SyntheticChannelAdapter**

```csharp
using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class SyntheticChannelAdapterTests
{
    [Fact]
    public async Task Pulls_five_deterministic_listings()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Smoobu);
        var first = await adapter.PullListingsAsync(CancellationToken.None);
        var second = await adapter.PullListingsAsync(CancellationToken.None);

        Assert.Equal(5, first.Count);
        Assert.Equal(first, second);
        Assert.Equal("smoobu-listing-1", first[0].ExternalId);
        Assert.Equal("mkt_zakopane", first[0].MarketId);
        Assert.Equal("mkt_gdansk", first[1].MarketId);
    }

    [Fact]
    public async Task Provider_property_reflects_constructor()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Hostaway);
        Assert.Equal(ChannelProvider.Hostaway, adapter.Provider);
    }

    [Fact]
    public async Task Push_records_last_pushed_rates()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Beds24);
        var rates = new[] { new RateUpdate(new DateOnly(2026, 8, 1), 300m) };
        await adapter.PushRatesAsync("beds24-listing-1", rates, CancellationToken.None);

        Assert.Equal(rates, adapter.LastPushedRates);
    }

    [Fact]
    public async Task Pulls_one_reservation_per_listing()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Smoobu);
        var reservations = await adapter.PullReservationsAsync(new DateOnly(2026, 8, 1), new DateOnly(2026, 9, 1), CancellationToken.None);
        Assert.Equal(5, reservations.Count);
        Assert.Equal(new DateOnly(2026, 8, 2), reservations[0].CheckIn); // i=1 → from + 1
        Assert.Equal(250m, reservations[0].TotalPrice);                  // 200 + 1*50
    }
}
```

- [ ] **Step 2: Failing testy ConnectionRegistry + SyncRunner**

```csharp
using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class SyncRunnerTests
{
    [Fact]
    public void Registry_generates_deterministic_ids_per_provider()
    {
        var registry = new ConnectionRegistry();
        var a = registry.Add(ChannelProvider.Beds24);
        var b = registry.Add(ChannelProvider.Beds24);
        var c = registry.Add(ChannelProvider.Smoobu);

        Assert.Equal("con_beds24_1", a.Id);
        Assert.Equal("con_beds24_2", b.Id);
        Assert.Equal("con_smoobu_1", c.Id);
        Assert.Equal("connected", a.Status);
    }

    [Fact]
    public void Registry_find_and_all()
    {
        var registry = new ConnectionRegistry();
        var a = registry.Add(ChannelProvider.Hostaway);
        Assert.Equal(a, registry.Find(a.Id));
        Assert.Null(registry.Find("con_nope_1"));
        Assert.Single(registry.All());
    }

    [Fact]
    public async Task Sync_pulls_listings_and_reservations()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Beds24);
        var runner = new SyncRunner();
        var result = await runner.SyncAsync(adapter, "con_beds24_1", new DateOnly(2026, 8, 1), new DateOnly(2026, 9, 1), CancellationToken.None);

        Assert.Equal("con_beds24_1", result.ConnectionId);
        Assert.Equal(5, result.ListingsPulled);
        Assert.Equal(5, result.ReservationsPulled);
    }
}
```

- [ ] **Step 3: Uruchom — FAIL kompilacją**

Run: `dotnet test services/channelsync/tests/Rezio.ChannelSync.Domain.Tests`
Expected: FAIL

- [ ] **Step 4: Implementacja**

`SyntheticChannelAdapter.cs`:
```csharp
namespace Rezio.ChannelSync.Domain;

/// <summary>
/// Deterministyczny adapter (bez sieci, bez Random) — stoi za tą samą abstrakcją
/// IChannelAdapter, za którą wejdą prawdziwe adaptery Beds24/Smoobu/Hostaway.
/// </summary>
public sealed class SyntheticChannelAdapter(ChannelProvider provider) : IChannelAdapter
{
    private static readonly string[] Markets =
        ["mkt_zakopane", "mkt_gdansk", "mkt_krakow", "mkt_warszawa"];

    public ChannelProvider Provider => provider;
    public IReadOnlyList<RateUpdate>? LastPushedRates { get; private set; }

    private string ProviderSlug => provider.ToString().ToLowerInvariant();

    public Task<IReadOnlyList<ChannelListing>> PullListingsAsync(CancellationToken ct)
    {
        var listings = Enumerable.Range(1, 5).Select(i => new ChannelListing(
            ExternalId: $"{ProviderSlug}-listing-{i}",
            Title: $"{provider} listing {i}",
            MarketId: Markets[(i - 1) % 4])).ToList();
        return Task.FromResult<IReadOnlyList<ChannelListing>>(listings);
    }

    public Task<IReadOnlyList<Reservation>> PullReservationsAsync(DateOnly from, DateOnly to, CancellationToken ct)
    {
        var reservations = Enumerable.Range(1, 5).Select(i =>
        {
            var checkIn = from.AddDays(i);
            return new Reservation(
                ExternalListingId: $"{ProviderSlug}-listing-{i}",
                CheckIn: checkIn,
                CheckOut: checkIn.AddDays(2),
                TotalPrice: 200m + i * 50m);
        }).Where(r => r.CheckIn <= to).ToList();
        return Task.FromResult<IReadOnlyList<Reservation>>(reservations);
    }

    public Task PushRatesAsync(string externalListingId, IReadOnlyList<RateUpdate> rates, CancellationToken ct)
    {
        LastPushedRates = rates;
        return Task.CompletedTask;
    }
}
```

`ConnectionRegistry.cs`:
```csharp
using System.Collections.Concurrent;

namespace Rezio.ChannelSync.Domain;

public sealed record Connection(string Id, ChannelProvider Provider, string Status);

public sealed class ConnectionRegistry
{
    private readonly ConcurrentDictionary<string, Connection> _connections = new();
    private readonly ConcurrentDictionary<ChannelProvider, int> _counters = new();

    public Connection Add(ChannelProvider provider)
    {
        var n = _counters.AddOrUpdate(provider, 1, (_, current) => current + 1);
        var id = $"con_{provider.ToString().ToLowerInvariant()}_{n}";
        var connection = new Connection(id, provider, "connected");
        _connections[id] = connection;
        return connection;
    }

    public Connection? Find(string id) => _connections.GetValueOrDefault(id);

    public IReadOnlyList<Connection> All() => _connections.Values.ToList();
}
```

`SyncRunner.cs`:
```csharp
namespace Rezio.ChannelSync.Domain;

public sealed record SyncResult(string ConnectionId, int ListingsPulled, int ReservationsPulled);

public sealed class SyncRunner
{
    public async Task<SyncResult> SyncAsync(
        IChannelAdapter adapter, string connectionId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var listings = await adapter.PullListingsAsync(ct);
        var reservations = await adapter.PullReservationsAsync(from, to, ct);
        return new SyncResult(connectionId, listings.Count, reservations.Count);
    }
}
```

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: synthetic channel adapter, connection registry, sync runner"
```

---

### Task 6: API — connections, listings, sync, health, Serilog

**Files:**
- Create: `services/channelsync/src/Rezio.ChannelSync.Api/Contracts.cs`
- Create: `services/channelsync/src/Rezio.ChannelSync.Api/AdapterFactory.cs`
- Modify: `services/channelsync/src/Rezio.ChannelSync.Api/Program.cs` (całość poniżej)
- Test: `services/channelsync/tests/Rezio.ChannelSync.Api.Tests/ChannelSyncEndpointTests.cs`
- Delete: `services/channelsync/tests/Rezio.ChannelSync.Api.Tests/UnitTest1.cs`

**Interfaces:**
- Consumes: `ConnectionRegistry`, `SyncRunner`, `SyntheticChannelAdapter`, `ChannelProvider`, `Connection`, `SyncResult`, `ChannelListing` (Taski 2–5)
- Produces: HTTP API snake_case —
  - `POST /v1/connections` (body `{provider}` gdzie provider = `"beds24"|"smoobu"|"hostaway"`, case-insensitive → `201 ConnectionResponse` | 400 nieznany provider)
  - `GET /v1/connections/{id}` (`200 ConnectionResponse` | 404)
  - `GET /v1/connections/{id}/listings` (`200 ListingsResponse` — oferty z syntetycznego adaptera providera połączenia | 404)
  - `POST /v1/connections/{id}/sync` (body `{from,to}` → `200 SyncResult` | 404 | 400 zły zakres)
  - `GET /health`

- [ ] **Step 1: Dodaj pakiety (jak w pozostałych serwisach)**

```bash
dotnet add services/channelsync/src/Rezio.ChannelSync.Api package Serilog.AspNetCore
dotnet add services/channelsync/src/Rezio.ChannelSync.Api package Serilog.Sinks.Grafana.Loki
dotnet add services/channelsync/src/Rezio.ChannelSync.Api package AspNetCore.HealthChecks.UI.Client
```

- [ ] **Step 2: Failing testy integracyjne**

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.ChannelSync.Api.Tests;

public class ChannelSyncEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    private async Task<string> CreateConnection(string provider = "beds24")
    {
        var resp = await _client.PostAsJsonAsync("/v1/connections", new { provider });
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        return (string)json["id"]!;
    }

    [Fact]
    public async Task Create_connection_returns_201_with_id_and_status()
    {
        var resp = await _client.PostAsJsonAsync("/v1/connections", new { provider = "smoobu" });
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.StartsWith("con_smoobu_", (string)json["id"]!);
        Assert.Equal("connected", (string)json["status"]!);
        Assert.Equal("smoobu", (string)json["provider"]!);
    }

    [Fact]
    public async Task Unknown_provider_returns_400()
    {
        var resp = await _client.PostAsJsonAsync("/v1/connections", new { provider = "nonsense" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Get_unknown_connection_returns_404()
    {
        var resp = await _client.GetAsync("/v1/connections/con_beds24_999");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Listings_endpoint_returns_five_for_connection()
    {
        var id = await CreateConnection("hostaway");
        var resp = await _client.GetAsync($"/v1/connections/{id}/listings");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal(5, json["listings"]!.AsArray().Count);
        Assert.StartsWith("hostaway-listing-", (string)json["listings"]![0]!["external_id"]!);
    }

    [Fact]
    public async Task Sync_endpoint_returns_counts()
    {
        var id = await CreateConnection("beds24");
        var resp = await _client.PostAsJsonAsync($"/v1/connections/{id}/sync",
            new { from = "2026-08-01", to = "2026-09-01" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal(5, (int)json["listings_pulled"]!);
        Assert.Equal(5, (int)json["reservations_pulled"]!);
    }

    [Fact]
    public async Task Sync_inverted_range_returns_400()
    {
        var id = await CreateConnection("beds24");
        var resp = await _client.PostAsJsonAsync($"/v1/connections/{id}/sync",
            new { from = "2026-09-01", to = "2026-08-01" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

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

- [ ] **Step 3: Uruchom — FAIL**

Run: `dotnet test services/channelsync/tests/Rezio.ChannelSync.Api.Tests`
Expected: FAIL

- [ ] **Step 4: Implementacja**

`Contracts.cs`:
```csharp
using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Api;

public sealed record CreateConnectionRequest(string Provider);

public sealed record ConnectionResponse(string Id, string Provider, string Status);

public sealed record ListingsResponse(string ConnectionId, IReadOnlyList<ChannelListing> Listings);

public sealed record SyncRequest(DateOnly From, DateOnly To);
```

`AdapterFactory.cs`:
```csharp
using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Api;

// Buduje adapter dla providera połączenia. Dziś zawsze syntetyczny;
// prawdziwe adaptery (Beds24/Smoobu/Hostaway) wejdą tutaj za IChannelAdapter.
public interface IAdapterFactory
{
    IChannelAdapter For(ChannelProvider provider);
}

public sealed class SyntheticAdapterFactory : IAdapterFactory
{
    public IChannelAdapter For(ChannelProvider provider) => new SyntheticChannelAdapter(provider);
}
```

`Program.cs` (całość):
```csharp
using System.Text.Json;
using HealthChecks.UI.Client;
using Rezio.ChannelSync.Api;
using Rezio.ChannelSync.Domain;
using Serilog;
using Serilog.Events;
using Serilog.Sinks.Grafana.Loki;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSerilog(lc =>
{
    lc.MinimumLevel.Information()
      .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
      .Enrich.FromLogContext()
      .WriteTo.Console();
    var lokiUrl = builder.Configuration["LOKI_URL"];
    if (!string.IsNullOrWhiteSpace(lokiUrl))
        lc.WriteTo.GrafanaLoki(lokiUrl,
            labels: [new LokiLabel { Key = "service", Value = "channelsync-api" }]);
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton<ConnectionRegistry>();
builder.Services.AddSingleton<SyncRunner>();
builder.Services.AddSingleton<IAdapterFactory, SyntheticAdapterFactory>();

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

app.MapPost("/v1/connections", (CreateConnectionRequest request, ConnectionRegistry registry) =>
{
    if (!Enum.TryParse<ChannelProvider>(request.Provider, ignoreCase: true, out var provider))
        return Results.Problem(statusCode: 400, title: "Unknown provider",
            detail: "provider must be one of: beds24, smoobu, hostaway.");

    var connection = registry.Add(provider);
    return Results.Created($"/v1/connections/{connection.Id}",
        new ConnectionResponse(connection.Id, connection.Provider.ToString().ToLowerInvariant(), connection.Status));
});

app.MapGet("/v1/connections/{id}", (string id, ConnectionRegistry registry) =>
{
    var connection = registry.Find(id);
    return connection is null
        ? Results.Problem(statusCode: 404, title: "Connection not found")
        : Results.Ok(new ConnectionResponse(id, connection.Provider.ToString().ToLowerInvariant(), connection.Status));
});

app.MapGet("/v1/connections/{id}/listings", async (string id, ConnectionRegistry registry, IAdapterFactory factory, CancellationToken ct) =>
{
    var connection = registry.Find(id);
    if (connection is null)
        return Results.Problem(statusCode: 404, title: "Connection not found");

    var adapter = factory.For(connection.Provider);
    var listings = await adapter.PullListingsAsync(ct);
    return Results.Ok(new ListingsResponse(id, listings));
});

app.MapPost("/v1/connections/{id}/sync", async (string id, SyncRequest request, ConnectionRegistry registry, SyncRunner runner, IAdapterFactory factory, CancellationToken ct) =>
{
    if (request.To < request.From || request.To.DayNumber - request.From.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var connection = registry.Find(id);
    if (connection is null)
        return Results.Problem(statusCode: 404, title: "Connection not found");

    var adapter = factory.For(connection.Provider);
    var result = await runner.SyncAsync(adapter, id, request.From, request.To, ct);
    return Results.Ok(result);
});

app.Run();

public partial class Program;
```

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: channel-sync api (connections, listings, sync, health, logging)"
```

---

### Task 7: Dockerfile, compose (channelsync na :8083), README

**Files:**
- Create: `services/channelsync/Dockerfile`
- Modify: `docker-compose.yml` (serwis `channelsync-api` + wpis `__3__` w HealthChecks UI + `depends_on`)
- Modify: `README.md` (wiersz w tabeli usług)

**Interfaces:**
- Consumes: publikowalny `Rezio.ChannelSync.Api` (Task 6), compose z planów 1–3
- Produces: `docker compose up` podnosi channelsync-api na `:8083`; HealthChecks UI monitoruje cztery serwisy

- [ ] **Step 1: `services/channelsync/Dockerfile`**

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish services/channelsync/src/Rezio.ChannelSync.Api -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Rezio.ChannelSync.Api.dll"]
```

- [ ] **Step 2: Rozszerz `docker-compose.yml`**

Nowy serwis (obok pozostałych `*-api`):

```yaml
  channelsync-api:
    build:
      context: .
      dockerfile: services/channelsync/Dockerfile
    ports:
      - "8083:8080"
    environment:
      LOKI_URL: http://loki:3100
    depends_on:
      - loki
```

W `healthchecks-ui.environment` dopisz:

```yaml
      HealthChecksUI__HealthChecks__3__Name: channelsync-api
      HealthChecksUI__HealthChecks__3__Uri: http://channelsync-api:8080/health
```

oraz w `healthchecks-ui.depends_on` dopisz `- channelsync-api`.

- [ ] **Step 3: Zaktualizuj `README.md`**

Wiersz w tabeli usług (po Scraper API):

```markdown
| Channel-Sync API | http://localhost:8083 (przykład: `POST /v1/connections {"provider":"beds24"}`, potem `POST /v1/connections/{id}/sync`) |
```

- [ ] **Step 4: Odpal cały system i zweryfikuj**

Run: `docker compose up --build -d`, potem:
- `curl -X POST http://localhost:8083/v1/connections -H "Content-Type: application/json" -d '{"provider":"beds24"}'` → 201, `id` zaczyna się od `con_beds24_`
- użyj zwróconego id: `curl "http://localhost:8083/v1/connections/{id}/listings"` → 200, 5 ofert
- `curl -X POST http://localhost:8083/v1/connections/{id}/sync -H "Content-Type: application/json" -d '{"from":"2026-08-01","to":"2026-09-01"}'` → 200, `listings_pulled: 5`, `reservations_pulled: 5`
- `curl http://localhost:8083/health` → Healthy
- pozostałe serwisy (:8081, :8082, pricing przez sieć kontenerów jeśli host :8080 zajęty) dalej działają
- HealthChecks UI pokazuje CZTERY serwisy Healthy (przez sieć kontenerów — host :8090 zajmuje lokalny nginx)
- Loki: `{service="channelsync-api"}` zwraca logi

Na koniec: `docker compose down`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add channelsync-api to compose stack and README"
```

---

## Poza zakresem tego planu (kolejne plany)

- **Prawdziwe adaptery Beds24/Smoobu/Hostaway** za `IChannelAdapter` (klucze API/partnerstwo, mapowanie modeli) — wchodzą do `AdapterFactory`
- Integracja z pricing (pobranie rekomendacji → `PushRatesAsync`) i zdarzenia `sync.completed` / `connection.error` (RabbitMQ) — plan integracyjny
- Persystencja połączeń, ofert, rezerwacji (Postgres/EF Core) — teraz in-memory
- Szyfrowanie credentials połączeń (Secrets/KMS) — teraz połączenie bez sekretów (syntetyczne)
- Harmonogram cyklicznej synchronizacji (Quartz.NET) — teraz trigger ręczny
- Webhook `connection.error` po wyczerpaniu prób push (`PushOutcome.Failed`) — hook istnieje w domenie, event w planie integracyjnym
