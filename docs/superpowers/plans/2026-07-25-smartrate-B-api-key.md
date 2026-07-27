# Autoryzacja kluczem API — Plan B (Rezio.SmartRate)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endpointy `/v1/quote` i `/v1/markets` wymagają nagłówka `X-Api-Key`, gdy klucz jest skonfigurowany — żeby RezFlow mógł wołać SmartRate przez publiczny internet bez wystawiania silnika cen każdemu.

**Architecture:** Jeden endpoint-filter (`IEndpointFilter`) sprawdzający nagłówek w czasie stałym, wpięty tylko w te dwa endpointy. Klucz z konfiguracji (`SMARTRATE_API_KEY`). Gdy klucz nie jest skonfigurowany, filtr przepuszcza — inaczej wbudowany panel administratora (vanilla JS pod `/`) przestałby działać na localhoście, a wpisanie klucza w kod strony i tak by go ujawniło.

**Tech Stack:** .NET (minimal API, `IEndpointFilter`), xUnit + `WebApplicationFactory`.

## Global Constraints

- **Wdrożenie produkcyjne musi ustawić `SMARTRATE_API_KEY`**; bez klucza serwis nie powinien być wystawiony publicznie. Zapisz to w README.
- Porównanie klucza w **czasie stałym** (`CryptographicOperations.FixedTimeEquals`) — bez timing-oracle.
- Filtr obejmuje wyłącznie `/v1/quote` i `/v1/markets`. `/health`, panel `/` i `/v1/internal/*` bez zmian (ten ostatni jest wołany przez scrapera w sieci wewnętrznej).
- Kod i komentarze zgodne z konwencją repo; brak nowych zależności.

---

### Task B-T1: Filtr `X-Api-Key` z testami

**Files:**
- Create: `services/monolith/src/Rezio.Api/ApiKeyFilter.cs`
- Modify: `services/monolith/src/Rezio.Api/Program.cs`
- Create: `services/monolith/tests/Rezio.Api.Tests/ApiKeyFilterTests.cs`
- Modify: `README.md`

**Interfaces:**
- Produces: `ApiKeyFilter` (implementuje `IEndpointFilter`), rozszerzenie `RouteHandlerBuilder.RequireApiKey()`.

- [ ] **Step 1: Napisz failujące testy**

Utwórz `services/monolith/tests/Rezio.Api.Tests/ApiKeyFilterTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Rezio.Api.Tests;

public class ApiKeyFilterTests
{
    private static WebApplicationFactory<Program> FactoryWithKey(string? key) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            if (key is not null)
                b.UseSetting("SMARTRATE_API_KEY", key);
        });

    private static object QuoteBody() => new
    {
        market_id = "mkt_gdansk",
        base_price = 200m,
        min_price = 140m,
        max_price = 360m,
        from = "2026-08-01",
        to = "2026-08-03",
    };

    [Fact]
    public async Task Quote_without_key_is_unauthorized_when_key_configured()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/v1/quote", QuoteBody());
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Quote_with_wrong_key_is_unauthorized()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", "nie-ten");
        var resp = await client.PostAsJsonAsync("/v1/quote", QuoteBody());
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Quote_with_correct_key_succeeds()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", "sekret");
        var resp = await client.PostAsJsonAsync("/v1/quote", QuoteBody());
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task Markets_requires_key_too()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/v1/markets")).StatusCode);

        client.DefaultRequestHeaders.Add("X-Api-Key", "sekret");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/v1/markets")).StatusCode);
    }

    [Fact]
    public async Task Without_configured_key_endpoints_stay_open()
    {
        using var factory = FactoryWithKey(null);
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/v1/markets")).StatusCode);
    }

    [Fact]
    public async Task Health_is_never_gated()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }
}
```

- [ ] **Step 2: Uruchom testy — mają failować**

```bash
dotnet test services/monolith/tests/Rezio.Api.Tests --filter ApiKeyFilterTests
```

Oczekiwane: FAIL — cztery testy dostają `200 OK` zamiast `401 Unauthorized`.

- [ ] **Step 3: Zaimplementuj filtr**

Utwórz `services/monolith/src/Rezio.Api/ApiKeyFilter.cs`:

```csharp
using System.Security.Cryptography;
using System.Text;

namespace Rezio.Api;

/// <summary>
/// Wymaga nagłówka X-Api-Key na endpointach wołanych spoza sieci prywatnej
/// (RezFlow z Vercela). Gdy klucz nie jest skonfigurowany, filtr przepuszcza —
/// wbudowany panel administratora woła /v1/quote z przeglądarki i nie ma gdzie
/// bezpiecznie trzymać sekretu. Wdrożenie produkcyjne MUSI ustawić klucz.
/// </summary>
public sealed class ApiKeyFilter(IConfiguration configuration) : IEndpointFilter
{
    private const string HeaderName = "X-Api-Key";

    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var expected = configuration["SMARTRATE_API_KEY"];
        if (string.IsNullOrWhiteSpace(expected))
            return await next(context);

        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (!FixedTimeEquals(provided, expected))
            return Results.Problem(statusCode: 401, title: "Unauthorized",
                detail: $"Missing or invalid {HeaderName} header.");

        return await next(context);
    }

    /// <summary>Porównanie w czasie stałym — bez timing-oracle na kluczu.</summary>
    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
}

public static class ApiKeyFilterExtensions
{
    public static RouteHandlerBuilder RequireApiKey(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter<ApiKeyFilter>();
}
```

- [ ] **Step 4: Wepnij filtr w dwa endpointy**

W `services/monolith/src/Rezio.Api/Program.cs` dopisz `.RequireApiKey()` do rejestracji `/v1/markets` (linia z `app.MapGet("/v1/markets", ...)`) oraz `/v1/quote` (linia z `app.MapPost("/v1/quote", ...)`) — na końcu każdego wywołania, przed średnikiem. Przykład dla `/v1/markets`:

```csharp
app.MapGet("/v1/markets", (MarketCatalog catalog) =>
    Results.Ok(new { markets = catalog.All() }))
   .RequireApiKey();
```

(Zachowaj istniejące ciało handlera — dokładasz wyłącznie `.RequireApiKey()`.)

- [ ] **Step 5: Uruchom testy — mają przejść**

```bash
dotnet test services/monolith/tests/Rezio.Api.Tests --filter ApiKeyFilterTests
```

Oczekiwane: PASS (6 testów).

- [ ] **Step 6: Uruchom pełny zestaw testów**

```bash
dotnet build && dotnet test
```

Oczekiwane: wszystkie testy zielone (poprzednio 176) — pozostałe testy nie ustawiają klucza, więc filtr je przepuszcza.

- [ ] **Step 7: Opisz konfigurację w `README.md`**

W `README.md`, pod tabelą usług, dopisz:

```markdown
## Autoryzacja API

`/v1/quote` i `/v1/markets` wymagają nagłówka `X-Api-Key`, gdy ustawiona jest
zmienna `SMARTRATE_API_KEY`. Bez niej endpointy są otwarte — tak działa lokalny
panel administratora, który woła `/v1/quote` z przeglądarki. **Wdrożenie
produkcyjne musi ustawić `SMARTRATE_API_KEY`**, a serwis bez klucza nie powinien
być wystawiony publicznie. Konsument (RezFlow) trzyma ten sam sekret w
`SMARTRATE_API_KEY` po swojej stronie.
```

- [ ] **Step 8: Commit**

```bash
git add services/monolith/src/Rezio.Api/ApiKeyFilter.cs services/monolith/src/Rezio.Api/Program.cs services/monolith/tests/Rezio.Api.Tests/ApiKeyFilterTests.cs README.md
git commit -m "Feat: autoryzacja X-Api-Key na /v1/quote i /v1/markets"
```
