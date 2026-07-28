# Rezio MVP — Plan 5: integracja zdarzeniami (MassTransit + RabbitMQ), pętla cena→push

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spiąć istniejące serwisy szyną zdarzeń (MassTransit) i zamknąć rdzeniową pętlę produktu jako pierwszy przepływ end-to-end: pricing liczy kalendarz cen i publikuje `PriceComputed` → channel-sync konsumuje i pushuje ceny przez `RatePushService` do adaptera połączenia. Transport: in-memory w testach/CI (deterministyczny, bez brokera), RabbitMQ w lokalnym stosie compose.

**Architecture:** Nowy współdzielony projekt `Rezio.Contracts` — WYŁĄCZNIE rekordy zdarzeń (czyste DTO, zero logiki). To jedyny współdzielony pakiet między serwisami — kontrakty zdarzeń są z definicji granicą międzyserwisową (inaczej niż logika domenowa, która pozostaje zduplikowana). Publikacja/konsumpcja jako cienkie klasy nad MassTransit; decyzja „co pushnąć" reużywa istniejącego `RatePushService` (plan 4) i `PricingEngine` (plan 1). Transport przełączany zmienną `RABBITMQ_URL` (obecna → RabbitMQ, brak → in-memory). Testy używają `AddMassTransitTestHarness` — bez realnego brokera, bez czekania.

**Kluczowa zasada:** logika biznesowa (jak policzyć cenę, czy plan cen jest bezpieczny, jak ponawiać push) już istnieje i jest przetestowana; ten plan dodaje wyłącznie warstwę transportu i cienką orkiestrację, testowaną harnessem MassTransit.

**Tech Stack:** .NET 10, C#, ASP.NET Core minimal APIs, MassTransit (in-memory + RabbitMQ), xUnit, Microsoft.AspNetCore.Mvc.Testing, Serilog, Docker Compose.

## Global Constraints

- TargetFramework: `net10.0` (dziedziczone); `TreatWarningsAsErrors=true`
- Testy: xUnit; komenda: `dotnet test`; obecny stan wyjściowy: 142 testów zielonych
- Determinizm testów: konsumenci/publisherzy testowani przez `AddMassTransitTestHarness` (in-memory), ZERO realnego RabbitMQ i ZERO `Task.Delay` w testach
- MassTransit: wybierz najnowszą stabilną wersję kompatybilną z net10.0 która się restore'uje (pakiet `MassTransit` + `MassTransit.RabbitMQ`); odnotuj wersję w raporcie. Rejestracja transportu: `RABBITMQ_URL` ustawione → `UsingRabbitMq` z `Host(new Uri(url))` + `ConfigureEndpoints(ctx)`; brak → `UsingInMemory` z `ConfigureEndpoints(ctx)`
- JSON w API: snake_case (jak w pozostałych serwisach), problem+json
- Nazwy: rekordy zdarzeń w namespace `Rezio.Contracts` (MassTransit dopasowuje po URN z namespace+typ — namespace MUSI być dokładnie `Rezio.Contracts`)
- Układ: `contracts/Rezio.Contracts/` (współdzielony), reszta w istniejących `services/*`; dopisanie do `Rezio.slnx`
- Commit po każdym tasku; komunikaty `feat:`/`chore:`/`test:`

---

### Task 1: Współdzielony projekt `Rezio.Contracts` (rekordy zdarzeń)

**Files:**
- Create (szablonem): `contracts/Rezio.Contracts/`
- Create: `contracts/Rezio.Contracts/PriceComputed.cs`
- Create (szablonem xunit): `contracts/Rezio.Contracts.Tests/`
- Create: `contracts/Rezio.Contracts.Tests/PriceComputedTests.cs`
- Modify: `Rezio.slnx`

**Interfaces:**
- Consumes: nic
- Produces:
  - `record RateLine(DateOnly Date, decimal Price)` w namespace `Rezio.Contracts`
  - `record PriceComputed(string ListingId, string ConnectionId, string ExternalListingId, string Currency, DateOnly From, DateOnly To, IReadOnlyList<RateLine> Rates)` w namespace `Rezio.Contracts`

- [ ] **Step 1: Utwórz projekty i podepnij do solucji**

```bash
dotnet new classlib -n Rezio.Contracts -o contracts/Rezio.Contracts
dotnet new xunit    -n Rezio.Contracts.Tests -o contracts/Rezio.Contracts.Tests
dotnet sln Rezio.slnx add contracts/Rezio.Contracts contracts/Rezio.Contracts.Tests
dotnet add contracts/Rezio.Contracts.Tests reference contracts/Rezio.Contracts
```

Usuń `Class1.cs`. Z obu `.csproj` usuń zduplikowane `<TargetFramework>`/`<Nullable>`/`<ImplicitUsings>` i puste `<PropertyGroup>` (wzorzec repo). Usuń `UnitTest1.cs` z Contracts.Tests (zastępujemy własnym).

- [ ] **Step 2: Failing test**

```csharp
using Rezio.Contracts;

namespace Rezio.Contracts.Tests;

public class PriceComputedTests
{
    [Fact]
    public void Namespace_is_exactly_Rezio_Contracts()
    {
        // MassTransit dopasowuje wiadomości po URN z namespace+typ — pilnujemy stałości.
        Assert.Equal("Rezio.Contracts", typeof(PriceComputed).Namespace);
        Assert.Equal("Rezio.Contracts", typeof(RateLine).Namespace);
    }

    [Fact]
    public void Price_computed_carries_rate_lines()
    {
        var evt = new PriceComputed(
            ListingId: "lst_demo",
            ConnectionId: "con_beds24_1",
            ExternalListingId: "beds24-listing-1",
            Currency: "PLN",
            From: new DateOnly(2026, 8, 1),
            To: new DateOnly(2026, 8, 2),
            Rates: [new RateLine(new DateOnly(2026, 8, 1), 350m), new RateLine(new DateOnly(2026, 8, 2), 380m)]);

        Assert.Equal(2, evt.Rates.Count);
        Assert.Equal(350m, evt.Rates[0].Price);
        Assert.Equal("PLN", evt.Currency);
    }
}
```

- [ ] **Step 3: Uruchom — FAIL kompilacją**

Run: `dotnet test contracts/Rezio.Contracts.Tests`
Expected: FAIL — brak typów

- [ ] **Step 4: Implementacja**

`PriceComputed.cs`:
```csharp
namespace Rezio.Contracts;

public sealed record RateLine(DateOnly Date, decimal Price);

public sealed record PriceComputed(
    string ListingId,
    string ConnectionId,
    string ExternalListingId,
    string Currency,
    DateOnly From,
    DateOnly To,
    IReadOnlyList<RateLine> Rates);
```

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS (144 = 142 + 2 nowe)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: shared event contracts project with PriceComputed"
```

---

### Task 2: pricing publikuje `PriceComputed` (MassTransit + endpoint publish-prices)

**Files:**
- Create: `services/pricing/src/Rezio.Pricing.Api/PricePublisher.cs`
- Modify: `services/pricing/src/Rezio.Pricing.Api/Program.cs` (dodanie MassTransit, referencji, endpointu)
- Modify: `services/pricing/src/Rezio.Pricing.Api/Rezio.Pricing.Api.csproj` (referencja do Contracts + pakiet MassTransit)
- Test: `services/pricing/tests/Rezio.Pricing.Api.Tests/PricePublisherTests.cs`
- Modify: `services/pricing/tests/Rezio.Pricing.Api.Tests/Rezio.Pricing.Api.Tests.csproj` (pakiet MassTransit do harnessu)

**Interfaces:**
- Consumes: `IListingStore`, `PricingEngine` (plan 1); `PriceComputed`, `RateLine` (Task 1); `IPublishEndpoint` (MassTransit)
- Produces:
  - `class PricePublisher(IListingStore store, IPublishEndpoint bus)` z metodą `Task<int> PublishAsync(string listingId, string connectionId, string externalListingId, DateOnly from, DateOnly to, DateOnly today, CancellationToken ct)` — liczy rekomendacje istniejącym pipeline'em, mapuje na `RateLine`, publikuje `PriceComputed`, zwraca liczbę dni (0 gdy oferta nieznana → nie publikuje)
  - Endpoint `POST /v1/listings/{id}/publish-prices` (body `{connection_id, external_listing_id, from, to}`) → `202` `{published_days}` | 404 nieznana oferta | 400 zły zakres

- [ ] **Step 1: Dodaj referencję i pakiety**

```bash
dotnet add services/pricing/src/Rezio.Pricing.Api reference contracts/Rezio.Contracts
dotnet add services/pricing/src/Rezio.Pricing.Api package MassTransit
dotnet add services/pricing/src/Rezio.Pricing.Api package MassTransit.RabbitMQ
dotnet add services/pricing/tests/Rezio.Pricing.Api.Tests package MassTransit
```

- [ ] **Step 2: Failing test (harness — publikacja zdarzenia)**

```csharp
using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.Contracts;
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api.Tests;

public class PricePublisherTests
{
    [Fact]
    public async Task Publishes_price_computed_with_rate_lines_for_known_listing()
    {
        await using var provider = new ServiceCollection()
            .AddSingleton<IListingStore, InMemoryListingStore>()
            .AddScoped<PricePublisher>()
            .AddMassTransitTestHarness()
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var publisher = scope.ServiceProvider.GetRequiredService<PricePublisher>();

            var from = new DateOnly(2026, 8, 1);
            var to = new DateOnly(2026, 8, 3);
            var days = await publisher.PublishAsync("lst_demo", "con_beds24_1", "beds24-listing-1",
                from, to, today: new DateOnly(2026, 7, 20), CancellationToken.None);

            Assert.Equal(3, days);
            Assert.True(await harness.Published.Any<PriceComputed>());

            var published = harness.Published.Select<PriceComputed>().First().Context.Message;
            Assert.Equal("lst_demo", published.ListingId);
            Assert.Equal("con_beds24_1", published.ConnectionId);
            Assert.Equal("PLN", published.Currency);
            Assert.Equal(3, published.Rates.Count);
            Assert.All(published.Rates, r => Assert.True(r.Price > 0));
        }
        finally
        {
            await harness.Stop();
        }
    }

    [Fact]
    public async Task Unknown_listing_publishes_nothing()
    {
        await using var provider = new ServiceCollection()
            .AddSingleton<IListingStore, InMemoryListingStore>()
            .AddScoped<PricePublisher>()
            .AddMassTransitTestHarness()
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var publisher = scope.ServiceProvider.GetRequiredService<PricePublisher>();
            var days = await publisher.PublishAsync("lst_nope", "con_beds24_1", "ext-1",
                new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 3), new DateOnly(2026, 7, 20), CancellationToken.None);

            Assert.Equal(0, days);
            Assert.False(await harness.Published.Any<PriceComputed>());
        }
        finally
        {
            await harness.Stop();
        }
    }
}
```

- [ ] **Step 3: Uruchom — FAIL kompilacją**

Run: `dotnet test services/pricing/tests/Rezio.Pricing.Api.Tests`
Expected: FAIL — brak `PricePublisher`

- [ ] **Step 4: Implementacja**

`PricePublisher.cs`:
```csharp
using MassTransit;
using Rezio.Contracts;
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public sealed class PricePublisher(IListingStore store, IPublishEndpoint bus)
{
    public async Task<int> PublishAsync(
        string listingId, string connectionId, string externalListingId,
        DateOnly from, DateOnly to, DateOnly today, CancellationToken ct)
    {
        var settings = store.FindSettings(listingId);
        if (settings is null)
            return 0;

        var rates = store.MarketDays(listingId, from, to)
            .Select(day => PricingEngine.Recommend(settings, day, today))
            .Select(rec => new RateLine(rec.Date, rec.RecommendedPrice))
            .ToList();

        await bus.Publish(new PriceComputed(
            listingId, connectionId, externalListingId, "PLN", from, to, rates), ct);

        return rates.Count;
    }
}
```

W `Program.cs` — dodaj usingi `using MassTransit;`, rejestrację MassTransit (przed `var app = builder.Build();`):
```csharp
builder.Services.AddMassTransit(x =>
{
    var rabbit = builder.Configuration["RABBITMQ_URL"];
    if (!string.IsNullOrWhiteSpace(rabbit))
        x.UsingRabbitMq((ctx, cfg) => { cfg.Host(new Uri(rabbit)); cfg.ConfigureEndpoints(ctx); });
    else
        x.UsingInMemory((ctx, cfg) => cfg.ConfigureEndpoints(ctx));
});
builder.Services.AddScoped<PricePublisher>();
```

Oraz nowy endpoint (obok istniejących `MapGet`):
```csharp
app.MapPost("/v1/listings/{id}/publish-prices",
    async (string id, PublishPricesRequest request, PricePublisher publisher, TimeProvider clock, CancellationToken ct) =>
{
    if (request.To < request.From || request.To.DayNumber - request.From.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var days = await publisher.PublishAsync(id, request.ConnectionId, request.ExternalListingId,
        request.From, request.To, today, ct);

    return days == 0
        ? Results.Problem(statusCode: 404, title: "Listing not found")
        : Results.Accepted($"/v1/listings/{id}/prices", new PublishPricesResponse(days));
});
```

Dodaj rekordy do `Contracts.cs` (Api):
```csharp
public sealed record PublishPricesRequest(string ConnectionId, string ExternalListingId, DateOnly From, DateOnly To);
public sealed record PublishPricesResponse(int PublishedDays);
```

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: pricing publishes PriceComputed via publish-prices endpoint"
```

---

### Task 3: channel-sync konsumuje `PriceComputed` i pushuje ceny

**Files:**
- Create: `services/channelsync/src/Rezio.ChannelSync.Api/PriceComputedConsumer.cs`
- Modify: `services/channelsync/src/Rezio.ChannelSync.Api/Program.cs` (MassTransit + rejestracja konsumenta + rejestracja `RatePushService`)
- Modify: `services/channelsync/src/Rezio.ChannelSync.Api/Rezio.ChannelSync.Api.csproj` (referencja Contracts + pakiety MassTransit)
- Modify: `services/channelsync/tests/Rezio.ChannelSync.Api.Tests/Rezio.ChannelSync.Api.Tests.csproj` (pakiet MassTransit)
- Test: `services/channelsync/tests/Rezio.ChannelSync.Api.Tests/PriceComputedConsumerTests.cs`

**Interfaces:**
- Consumes: `PriceComputed`, `RateLine` (Task 1); `ConnectionRegistry`, `IAdapterFactory`, `RatePushService`, `RateUpdate` (plan 4)
- Produces: `class PriceComputedConsumer : IConsumer<PriceComputed>` — na odbiór: znajdź połączenie po `ConnectionId` (nieznane → log warning, brak pushu), zbuduj `RateUpdate[]` z `Rates`, pushnij przez `RatePushService.PushAsync(adapter, ExternalListingId, rates, From, To, maxAttempts: 3)`; wynik zaloguj

- [ ] **Step 1: Dodaj referencję i pakiety**

```bash
dotnet add services/channelsync/src/Rezio.ChannelSync.Api reference contracts/Rezio.Contracts
dotnet add services/channelsync/src/Rezio.ChannelSync.Api package MassTransit
dotnet add services/channelsync/src/Rezio.ChannelSync.Api package MassTransit.RabbitMQ
dotnet add services/channelsync/tests/Rezio.ChannelSync.Api.Tests package MassTransit
```

- [ ] **Step 2: Failing test (harness — konsumpcja + push)**

```csharp
using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.ChannelSync.Domain;
using Rezio.Contracts;

namespace Rezio.ChannelSync.Api.Tests;

public class PriceComputedConsumerTests
{
    // Fabryka zwracająca współdzielony adapter, żeby test mógł odczytać LastPushedRates.
    private sealed class CapturingAdapterFactory(SyntheticChannelAdapter adapter) : IAdapterFactory
    {
        public IChannelAdapter For(ChannelProvider provider) => adapter;
    }

    [Fact]
    public async Task Consumes_price_computed_and_pushes_rates_for_known_connection()
    {
        var registry = new ConnectionRegistry();
        var connection = registry.Add(ChannelProvider.Beds24); // con_beds24_1
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Beds24);

        await using var provider = new ServiceCollection()
            .AddSingleton(registry)
            .AddSingleton<SyncRunner>()
            .AddSingleton<IAdapterFactory>(new CapturingAdapterFactory(adapter))
            .AddSingleton(new RatePushService((_, _) => Task.CompletedTask))
            .AddMassTransitTestHarness(x => x.AddConsumer<PriceComputedConsumer>())
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            await harness.Bus.Publish(new PriceComputed(
                ListingId: "lst_demo",
                ConnectionId: connection.Id,
                ExternalListingId: "beds24-listing-1",
                Currency: "PLN",
                From: new DateOnly(2026, 8, 1),
                To: new DateOnly(2026, 8, 2),
                Rates: [new RateLine(new DateOnly(2026, 8, 1), 350m), new RateLine(new DateOnly(2026, 8, 2), 380m)]));

            Assert.True(await harness.Consumed.Any<PriceComputed>());
            Assert.NotNull(adapter.LastPushedRates);
            Assert.Equal(2, adapter.LastPushedRates!.Count);
            Assert.Equal(350m, adapter.LastPushedRates[0].Price);
        }
        finally
        {
            await harness.Stop();
        }
    }

    [Fact]
    public async Task Unknown_connection_consumes_but_pushes_nothing()
    {
        var registry = new ConnectionRegistry(); // pusty — brak con_beds24_1
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Beds24);

        await using var provider = new ServiceCollection()
            .AddSingleton(registry)
            .AddSingleton<SyncRunner>()
            .AddSingleton<IAdapterFactory>(new CapturingAdapterFactory(adapter))
            .AddSingleton(new RatePushService((_, _) => Task.CompletedTask))
            .AddMassTransitTestHarness(x => x.AddConsumer<PriceComputedConsumer>())
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            await harness.Bus.Publish(new PriceComputed(
                "lst_demo", "con_nope_9", "ext-1", "PLN",
                new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 2),
                [new RateLine(new DateOnly(2026, 8, 1), 350m), new RateLine(new DateOnly(2026, 8, 2), 380m)]));

            Assert.True(await harness.Consumed.Any<PriceComputed>());
            Assert.Null(adapter.LastPushedRates);
        }
        finally
        {
            await harness.Stop();
        }
    }
}
```

- [ ] **Step 3: Uruchom — FAIL kompilacją**

Run: `dotnet test services/channelsync/tests/Rezio.ChannelSync.Api.Tests`
Expected: FAIL — brak `PriceComputedConsumer`

- [ ] **Step 4: Implementacja**

`PriceComputedConsumer.cs`:
```csharp
using MassTransit;
using Rezio.ChannelSync.Domain;
using Rezio.Contracts;

namespace Rezio.ChannelSync.Api;

public sealed class PriceComputedConsumer(
    ConnectionRegistry registry,
    IAdapterFactory factory,
    RatePushService pushService,
    ILogger<PriceComputedConsumer> logger) : IConsumer<PriceComputed>
{
    public async Task Consume(ConsumeContext<PriceComputed> context)
    {
        var msg = context.Message;
        var connection = registry.Find(msg.ConnectionId);
        if (connection is null)
        {
            logger.LogWarning("PriceComputed for unknown connection {ConnectionId} — skipping push", msg.ConnectionId);
            return;
        }

        var adapter = factory.For(connection.Provider);
        var rates = msg.Rates.Select(r => new RateUpdate(r.Date, r.Price)).ToList();

        var outcome = await pushService.PushAsync(
            adapter, msg.ExternalListingId, rates, msg.From, msg.To, maxAttempts: 3, context.CancellationToken);

        switch (outcome)
        {
            case PushOutcome.Success success:
                logger.LogInformation("Pushed {Count} rates to {ExternalListingId} in {Attempts} attempt(s)",
                    rates.Count, msg.ExternalListingId, success.AttemptsUsed);
                break;
            case PushOutcome.Failed failed:
                logger.LogError("Rate push to {ExternalListingId} failed after {Attempts} attempt(s): {Error}",
                    msg.ExternalListingId, failed.AttemptsUsed, failed.LastError);
                break;
        }
    }
}
```

W `Program.cs` — dodaj usingi `using MassTransit;`, zarejestruj `RatePushService` z realnym opóźnieniem oraz MassTransit z konsumentem (przed `var app = builder.Build();`):
```csharp
builder.Services.AddSingleton(new RatePushService((delay, ct) => Task.Delay(delay, ct)));
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<PriceComputedConsumer>();
    var rabbit = builder.Configuration["RABBITMQ_URL"];
    if (!string.IsNullOrWhiteSpace(rabbit))
        x.UsingRabbitMq((ctx, cfg) => { cfg.Host(new Uri(rabbit)); cfg.ConfigureEndpoints(ctx); });
    else
        x.UsingInMemory((ctx, cfg) => cfg.ConfigureEndpoints(ctx));
});
```

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: channel-sync consumes PriceComputed and pushes rates"
```

---

### Task 4: RabbitMQ w compose, konfiguracja obu serwisów, README

**Files:**
- Modify: `docker-compose.yml` (serwis `rabbitmq` + `RABBITMQ_URL` dla pricing-api i channelsync-api + `depends_on`)
- Modify: `README.md` (wiersz RabbitMQ + opis pętli)

**Interfaces:**
- Consumes: obrazy pricing-api / channelsync-api (Taski 2–3)
- Produces: `docker compose up` podnosi RabbitMQ (`:5672` AMQP, `:15672` management UI); pricing i channel-sync łączą się z brokerem; zdarzenie `PriceComputed` płynie między nimi

- [ ] **Step 1: Dodaj serwis RabbitMQ do `docker-compose.yml`**

```yaml
  rabbitmq:
    image: rabbitmq:3.13-management
    ports:
      - "5672:5672"
      - "15672:15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
```

- [ ] **Step 2: Podłącz pricing-api i channelsync-api do brokera**

W bloku `pricing-api` i `channelsync-api` (środowisko + zależność):

```yaml
    environment:
      LOKI_URL: http://loki:3100
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
    depends_on:
      loki:
        condition: service_started
      rabbitmq:
        condition: service_healthy
```

(Uwaga: `depends_on` dla tych dwóch serwisów zmienia formę na mapę z `condition` — istniejące `- loki` zamień na powyższą postać; pozostałe serwisy bez zmian.)

- [ ] **Step 3: Zaktualizuj `README.md`**

Dodaj wiersz w tabeli usług:

```markdown
| RabbitMQ (management) | http://localhost:15672 (guest/guest) — szyna zdarzeń między serwisami |
```

Dodaj krótką sekcję „Pętla cena→push":

```markdown
## Pętla cena→push (zdarzenia)

1. `POST /v1/connections {"provider":"beds24"}` na channel-sync (:8083) → zapamiętaj `id`.
2. `POST /v1/listings/lst_demo/publish-prices` na pricing (:8080) z `{"connection_id":"<id>","external_listing_id":"beds24-listing-1","from":"2026-08-01","to":"2026-08-07"}`.
3. pricing publikuje `PriceComputed` → channel-sync konsumuje i pushuje ceny (log w Grafanie: `{service="channelsync-api"}`).
```

- [ ] **Step 4: Odpal cały system i zweryfikuj przepływ end-to-end**

Run: `docker compose up --build -d`, poczekaj aż RabbitMQ healthy, potem:
- `curl -X POST http://localhost:8083/v1/connections -H "Content-Type: application/json" -d '{"provider":"beds24"}'` → 201, zapamiętaj `id`
- `curl -i -X POST http://localhost:8080/v1/listings/lst_demo/publish-prices -H "Content-Type: application/json" -d '{"connection_id":"<id>","external_listing_id":"beds24-listing-1","from":"2026-08-01","to":"2026-08-07"}'` → 202, `published_days: 7`
  - (jeśli host :8080 zajęty przez MTAgentService — użyj scratchpadowego override portu jak w planach 2–4, NIE commituj go; albo odpal publish z wnętrza sieci kontenerów)
- Grafana/Loki: `{service="channelsync-api"}` zawiera log „Pushed 7 rates to beds24-listing-1 in 1 attempt(s)" — dowód, że zdarzenie przepłynęło przez brokera i push się wykonał
- RabbitMQ management (`http://localhost:15672`, guest/guest) pokazuje exchange/queue MassTransit
- HealthChecks UI: cztery serwisy dalej Healthy

Na koniec: `docker compose down`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add RabbitMQ broker to compose and wire pricing/channel-sync"
```

---

## Poza zakresem tego planu (kolejne plany)

- Kolejne przepływy zdarzeń: scraper `MarketStatsUpdated` → pricing (świeże obłożenie/ADR zamiast syntetycznego snapshotu); demand `DemandScoreUpdated` → pricing; channel-sync `ReservationCreated` → pricing/ML
- Zdarzenia `sync.completed` / `connection.error` (po `PushOutcome.Failed`) + webhooki wychodzące
- Idempotencja i outbox (MassTransit Transactional Outbox) przy dołożeniu Postgresa
- Persystencja (Postgres/EF Core) połączeń, ofert, rekomendacji, statystyk — teraz wszystko in-memory
- Retry/DLQ na poziomie MassTransit (obok wewnętrznego `BackoffPolicy`) + polityki `UseMessageRetry`
- api-gateway + auth (klucze API), realne adaptery CM i scrapingu (Playwright/proxy)
