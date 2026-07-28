# Rezio MVP — Plan 10: rozszerzenie na wiele miast (4 → 16 rynków)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozszerzyć rejestr rynków z 4 do **16 polskich miast** rozłożonych na 4 typy rynku i 10 województw, tak by system wyceniał realny przekrój destynacji STR (góry, morze, miasta turystyczne i biznesowe). Silnik cen/popytu bez zmian — krzywe sezonowe i wagi są *per typ*; każde nowe miasto używa krzywej swojego typu, a ferie MEN rozwiązują się per województwo.

**Architecture:** Zmiana danych, nie logiki. Źródłem prawdy o rynkach jest `InMemoryMarketRegistry` (`Rezio.Demand.Domain`). Scraper (osobny serwis) trzyma własną listę znanych rynków (te same ID). Panel (`wwwroot/index.html`) dostaje 16 rynków na mapie + listę grupowaną wg typu. Żadne krzywe (`SeasonFactor`, `DemandWeights`, `BASE_OCC`) nie wymagają zmian — są indeksowane typem rynku, a typów wciąż jest 4.

**Tech Stack:** .NET 10, ASP.NET Core, vanilla HTML/CSS/JS, xUnit, Docker.

## Global Constraints

- TargetFramework `net10.0`; `TreatWarningsAsErrors=true`; stan wyjściowy: 176 testów zielonych
- Typy rynku bez zmian (`MarketType`: Mountains/Seaside/CityBusiness/CityTourist)
- Województwa z istniejącego enuma `Voivodeship` (16 wartości); ferie MEN 2026 już pokrywają wszystkie
- Rynki muszą być spójne w 3 miejscach: `MarketRegistry.cs` (rejestr), `SyntheticListingSource.cs` (scraper KnownMarkets), `Program.cs` scrapera (`knownMarkets`) — te same 16 identyfikatorów
- Panel: mapa z pinami-kropkami (etykieta na hover/wybór, nie na stałe — inaczej 16 etykiet nachodzi na siebie) + lista rynków grupowana wg typu
- Commit po każdym tasku; `feat:`/`chore:`

### Wiążąca tabela 16 rynków (id, nazwa, typ, województwo, x, y na mapie viewBox 0..100)

| id | nazwa | typ | województwo (enum) | x | y |
|---|---|---|---|---|---|
| `mkt_swinoujscie` | Świnoujście | Seaside | Zachodniopomorskie | 16 | 15 |
| `mkt_kolobrzeg` | Kołobrzeg | Seaside | Zachodniopomorskie | 28 | 12 |
| `mkt_wladyslawowo` | Władysławowo | Seaside | Pomorskie | 47 | 10 |
| `mkt_gdansk` | Gdańsk | Seaside | Pomorskie | 52 | 14 |
| `mkt_poznan` | Poznań | CityTourist | Wielkopolskie | 29 | 38 |
| `mkt_torun` | Toruń | CityTourist | KujawskoPomorskie | 43 | 30 |
| `mkt_lodz` | Łódź | CityBusiness | Lodzkie | 46 | 46 |
| `mkt_warszawa` | Warszawa | CityBusiness | Mazowieckie | 61 | 42 |
| `mkt_lublin` | Lublin | CityTourist | Lubelskie | 72 | 52 |
| `mkt_wroclaw` | Wrocław | CityTourist | Dolnoslaskie | 30 | 57 |
| `mkt_karpacz` | Karpacz | Mountains | Dolnoslaskie | 24 | 63 |
| `mkt_katowice` | Katowice | CityBusiness | Slaskie | 47 | 64 |
| `mkt_szczyrk` | Szczyrk | Mountains | Slaskie | 45 | 72 |
| `mkt_krakow` | Kraków | CityTourist | Malopolskie | 56 | 70 |
| `mkt_krynica` | Krynica-Zdrój | Mountains | Malopolskie | 63 | 76 |
| `mkt_zakopane` | Zakopane | Mountains | Malopolskie | 53 | 84 |

(4 istniejące rynki zachowują swoje ID — bez migracji danych/testów pod nowe nazwy.)

---

### Task 1: Rozszerz rejestr rynków + scraper + testy

**Files:**
- Modify: `services/demand/src/Rezio.Demand.Domain/MarketRegistry.cs` (16 rynków)
- Modify: `services/scraper/src/Rezio.Scraper.Domain/SyntheticListingSource.cs` (`KnownMarkets` → 16 ID)
- Modify: `services/scraper/src/Rezio.Scraper.Api/Program.cs` (`knownMarkets` → 16 ID)
- Test: `services/monolith/tests/Rezio.Api.Tests/MarketExpansionTests.cs`

**Interfaces:**
- Produces: `InMemoryMarketRegistry` z 16 rynkami wg tabeli; scraper akceptuje te same 16 ID

- [ ] **Step 1: Failing testy**

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class MarketExpansionTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    private async Task<JsonNode> Quote(string market, string from, string to)
    {
        var r = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = market, base_price = 400, min_price = 200, max_price = 1200, from, to });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
    }

    [Theory]
    [InlineData("mkt_karpacz", "Mountains")]
    [InlineData("mkt_kolobrzeg", "Seaside")]
    [InlineData("mkt_wroclaw", "CityTourist")]
    [InlineData("mkt_lodz", "CityBusiness")]
    [InlineData("mkt_krynica", "Mountains")]
    public async Task New_markets_are_quotable_with_correct_type(string market, string type)
    {
        var json = await Quote(market, "2026-08-01", "2026-08-03");
        Assert.Equal(type, (string)json["market_type"]!);
        Assert.True((decimal)json["days"]!.AsArray()[0]!["recommended_price"]! > 0);
    }

    [Fact]
    public async Task Winter_break_fires_per_voivodeship_on_different_dates()
    {
        // 2026-01-25: pomorskie (Gdańsk) w feriach tura 1; małopolskie (Kraków) jeszcze nie
        var gdansk = await _client.GetAsync("/v1/markets/mkt_gdansk/demand?from=2026-01-25&to=2026-01-25");
        var krakow = await _client.GetAsync("/v1/markets/mkt_krakow/demand?from=2026-01-25&to=2026-01-25");
        var gj = JsonNode.Parse(await gdansk.Content.ReadAsStringAsync())!;
        var kj = JsonNode.Parse(await krakow.Content.ReadAsStringAsync())!;
        var gDrivers = gj["scores"]!.AsArray()[0]!["drivers"]!.AsArray().Select(n => (string)n!).ToList();
        var kDrivers = kj["scores"]!.AsArray()[0]!["drivers"]!.AsArray().Select(n => (string)n!).ToList();
        Assert.Contains(gDrivers, d => d.Contains("ferie zimowe"));   // pomorskie: tak
        Assert.DoesNotContain(kDrivers, d => d.Contains("ferie zimowe")); // małopolskie: nie (tura 2)
    }

    [Fact]
    public async Task Unknown_market_still_404()
    {
        var r = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_atlantyda", base_price = 400, min_price = 200, max_price = 1200,
            from = "2026-08-01", to = "2026-08-03" });
        Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
    }
}
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `dotnet test services/monolith/tests/Rezio.Api.Tests`
Expected: FAIL — nowe rynki nieznane (404)

- [ ] **Step 3: Rozszerz rejestr**

`MarketRegistry.cs` — zamień tablicę `Markets` na 16 wpisów wg tabeli (kolejność dowolna; zachowaj istniejące 4 ID). Przykład wpisów:
```csharp
new Market("mkt_swinoujscie", "Świnoujście", MarketType.Seaside, Voivodeship.Zachodniopomorskie),
new Market("mkt_kolobrzeg", "Kołobrzeg", MarketType.Seaside, Voivodeship.Zachodniopomorskie),
new Market("mkt_wladyslawowo", "Władysławowo", MarketType.Seaside, Voivodeship.Pomorskie),
new Market("mkt_gdansk", "Gdańsk", MarketType.Seaside, Voivodeship.Pomorskie),
new Market("mkt_poznan", "Poznań", MarketType.CityTourist, Voivodeship.Wielkopolskie),
new Market("mkt_torun", "Toruń", MarketType.CityTourist, Voivodeship.KujawskoPomorskie),
new Market("mkt_lodz", "Łódź", MarketType.CityBusiness, Voivodeship.Lodzkie),
new Market("mkt_warszawa", "Warszawa", MarketType.CityBusiness, Voivodeship.Mazowieckie),
new Market("mkt_lublin", "Lublin", MarketType.CityTourist, Voivodeship.Lubelskie),
new Market("mkt_wroclaw", "Wrocław", MarketType.CityTourist, Voivodeship.Dolnoslaskie),
new Market("mkt_karpacz", "Karpacz", MarketType.Mountains, Voivodeship.Dolnoslaskie),
new Market("mkt_katowice", "Katowice", MarketType.CityBusiness, Voivodeship.Slaskie),
new Market("mkt_szczyrk", "Szczyrk", MarketType.Mountains, Voivodeship.Slaskie),
new Market("mkt_krakow", "Kraków", MarketType.CityTourist, Voivodeship.Malopolskie),
new Market("mkt_krynica", "Krynica-Zdrój", MarketType.Mountains, Voivodeship.Malopolskie),
new Market("mkt_zakopane", "Zakopane", MarketType.Mountains, Voivodeship.Malopolskie),
```

`SyntheticListingSource.cs` — `KnownMarkets` na te same 16 ID.
`Program.cs` scrapera — `knownMarkets` na te same 16 ID.

- [ ] **Step 4: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS (istniejące + nowe; 4 stare rynki działają jak dotąd)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: expand market registry to 16 Polish cities"
```

---

### Task 2: Panel — mapa 16 rynków + lista grupowana + docs + e2e

**Files:**
- Modify: `services/monolith/src/Rezio.Api/wwwroot/index.html` (dostarczony przez kontrolera — 16 rynków, mapa kropki+hover, lista grupowana)
- Modify: `docs/ARCHITECTURE.md`, `README.md` (wzmianka o 16 rynkach)

**Interfaces:**
- Produces: panel z 16 rynkami do wyboru (mapa + lista wg typu); wycena dowolnego działa przez `POST /v1/quote`

**Uwaga:** `wwwroot/index.html` zostanie zaktualizowany przez kontrolera PRZED tym taskiem (mapa dla 16 pinów: kropki zawsze, etykieta na hover/wybór; pod mapą lista rynków grupowana wg typu). Implementer NIE pisze HTML — weryfikuje suite, docker i aktualizuje docs.

- [ ] **Step 1: Suite dalej zielone**

Run: `dotnet test`
Expected: PASS (smoke test panelu `GET /` bez zmian; frontend to statyczny asset)

- [ ] **Step 2: Docs**

W `docs/ARCHITECTURE.md` (§2/§9 lub tabela rynków) i `README.md`: zaznacz, że system obsługuje 16 rynków (góry/morze/miasta) na 10 województwach. Krótko, bez przepisywania całości.

- [ ] **Step 3: e2e (Docker)**

`docker compose up --build -d` (porty jak zwykle mogą być zajęte — scratchpadowy override, nie commitować). Zweryfikuj wycenę kilku nowych miast pokazującą różne krzywe:
- `POST /v1/quote mkt_kolobrzeg 2026-08-01..2026-08-03` → Seaside, wysoki sezon letni
- `POST /v1/quote mkt_karpacz 2026-02-09..2026-02-11` → Mountains, ferie dolnośląskie (tura 2) → driver „ferie zimowe (dolnośląskie)"
- `POST /v1/quote mkt_lodz 2026-09-08..2026-09-10` → CityBusiness, zwykły tydzień, demand ~50
- `GET /` → panel serwuje HTML z 16 rynkami
- `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: admin console + docs for 16 markets"
```

---

## Poza zakresem (kolejne)

- Nowy typ rynku „jeziora/Mazury” (Giżycko, Mikołajki) — wymaga nowej krzywej sezonowej + wag popytu + bazy obłożenia (osobna, opiniotwórcza zmiana)
- Rynki jako dane w Postgresie (tabela `markets`) zamiast zaszytego rejestru — przy tabeli `listings`
- Dedup listy rynków między monolitem a scraperem (dziś dwie kopie ID)
- Realne współrzędne geo + prawdziwy slippy-map w panelu
