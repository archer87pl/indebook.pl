# Rezio MVP — Plan 3: market-scraper (pipeline: źródło → klasyfikacja → agregaty rynkowe)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trzeci mikroserwis `market-scraper`: pełny pipeline danych rynkowych — pobranie ofert i kalendarzy ze źródła (`IListingSource`), klasyfikacja do taksonomii comp-set (kategoria + tagi), agregacja do statystyk dziennych rynku (mediana ceny, obłożenie, liczba ofert) i wystawienie ich przez `GET /v1/markets/{id}/stats` + ręczny trigger `POST /v1/scrape-jobs`.

**Architecture:** Lustrzana do pricing/demand. Czysta domena `Rezio.Scraper.Domain`: `ListingClassifier` (reguły PL/EN → kategoria/tagi), `MarketAggregator` (obserwacje → `MarketDailyStats`), `SyntheticListingSource` (deterministyczny generator — bez sieci, bez `Random`). API `Rezio.Scraper.Api`: `ScrapeRunner` orkiestrujący pipeline, in-memory store statystyk, rejestr 4 rynków. **Prawdziwy adapter Airbnb/Booking wejdzie później za tę samą abstrakcję `IListingSource`** (wymaga proxy — decyzja kosztowa poza tym planem); dzięki temu cały pipeline jest deterministyczny i testowalny w CI.

**Tech Stack:** .NET 10, C#, ASP.NET Core minimal APIs, xUnit, Microsoft.AspNetCore.Mvc.Testing, Serilog (+ sink Loki), ASP.NET Core HealthChecks, Docker Compose.

## Global Constraints

- TargetFramework: `net10.0` (dziedziczone z `Directory.Build.props`); `TreatWarningsAsErrors=true`
- Testy: xUnit; komenda: `dotnet test`; obecny stan wyjściowy: 79 testów zielonych
- JSON w API: snake_case (`JsonNamingPolicy.SnakeCaseLower`), błędy problem+json
- Daty: `DateOnly`; determinizm: w domenie ZERO `Random`, `DateTime.Now`, `Guid.NewGuid` — synteza wyłącznie arytmetyką na indeksach i `DayNumber`
- Układ: `services/scraper/src/*`, `services/scraper/tests/*`; dopisanie do `Rezio.slnx`
- Limit zakresu dat: `to < from || to.DayNumber - from.DayNumber >= 365` → 400 (spójnie z pricing/demand)
- Rejestr rynków: te same 4 identyfikatory co w demand (`mkt_zakopane`, `mkt_gdansk`, `mkt_krakow`, `mkt_warszawa`) — własna kopia w scraperze (serwisy niezależne)
- Taksonomia (zgodna ze spec §4 „Segmentacja i comp sets"): kategorie `Apartament, DomDomek, Pokoj, HotelAparthotel, PensjonatWilla, Agroturystyka, GlampingNietypowe`; tagi jako stringi: `widok_gory, widok_woda, przy_stoku, blisko_plazy, sauna_balia, jacuzzi, kominek, zwierzeta_ok, agro_zwierzeta`
- Agregacja (wiążące definicje): per data — `ActiveListings` = liczba obserwacji; `OccupancyRate` = udział niedostępnych wśród aktywnych; `MedianPrice` = mediana cen ofert **dostępnych** (parzysta liczba → średnia dwóch środkowych; brak dostępnych → mediana cen wszystkich obserwacji)
- Źródło syntetyczne (wiążące wzory): 30 ofert per znany rynek, `ExternalRef = $"syn_{marketId}_{i:D3}"` dla i=1..30; cena bazowa `150 + (i % 10) * 25` PLN, piątek/sobota ×1.2, zaokrąglenie do pełnych PLN AwayFromZero; dostępność `((i * 31 + date.DayNumber * 7) % 10) >= 3`
- Commit po każdym tasku; komunikaty `feat:`/`chore:`/`test:`

---

### Task 1: Scaffold projektów scraper

**Files:**
- Create (szablonami): `services/scraper/src/Rezio.Scraper.Domain/`, `services/scraper/src/Rezio.Scraper.Api/`, `services/scraper/tests/Rezio.Scraper.Domain.Tests/`, `services/scraper/tests/Rezio.Scraper.Api.Tests/`
- Modify: `Rezio.slnx`

**Interfaces:**
- Consumes: `Rezio.slnx`, `Directory.Build.props`
- Produces: budowalne 4 projekty

- [ ] **Step 1: Utwórz projekty i podepnij do solucji**

```bash
dotnet new classlib -n Rezio.Scraper.Domain -o services/scraper/src/Rezio.Scraper.Domain
dotnet new web      -n Rezio.Scraper.Api    -o services/scraper/src/Rezio.Scraper.Api
dotnet new xunit    -n Rezio.Scraper.Domain.Tests -o services/scraper/tests/Rezio.Scraper.Domain.Tests
dotnet new xunit    -n Rezio.Scraper.Api.Tests    -o services/scraper/tests/Rezio.Scraper.Api.Tests
dotnet sln Rezio.slnx add services/scraper/src/Rezio.Scraper.Domain services/scraper/src/Rezio.Scraper.Api services/scraper/tests/Rezio.Scraper.Domain.Tests services/scraper/tests/Rezio.Scraper.Api.Tests
dotnet add services/scraper/src/Rezio.Scraper.Api reference services/scraper/src/Rezio.Scraper.Domain
dotnet add services/scraper/tests/Rezio.Scraper.Domain.Tests reference services/scraper/src/Rezio.Scraper.Domain
dotnet add services/scraper/tests/Rezio.Scraper.Api.Tests reference services/scraper/src/Rezio.Scraper.Api
dotnet add services/scraper/tests/Rezio.Scraper.Api.Tests package Microsoft.AspNetCore.Mvc.Testing
```

- [ ] **Step 2: Wyczyść szablony (wzorzec z planów 1–2)**

Usuń `Class1.cs` z Domain. Z czterech nowych `.csproj` usuń zduplikowane `<TargetFramework>`, `<Nullable>`, `<ImplicitUsings>` i puste `<PropertyGroup>`. Zostaw `UnitTest1.cs` w obu projektach testowych. Dopilnuj newline na końcu każdego `.csproj`.

- [ ] **Step 3: Zbuduj i odpal testy**

Run: `dotnet build && dotnet test`
Expected: build OK; 81 testów PASS (79 + 2 smoke)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold scraper service skeleton"
```

---

### Task 2: Modele + klasyfikator taksonomii (kategoria, tagi)

**Files:**
- Create: `services/scraper/src/Rezio.Scraper.Domain/ListingCategory.cs`
- Create: `services/scraper/src/Rezio.Scraper.Domain/RawListing.cs`
- Create: `services/scraper/src/Rezio.Scraper.Domain/ListingClassifier.cs`
- Test: `services/scraper/tests/Rezio.Scraper.Domain.Tests/ListingClassifierTests.cs`
- Delete: `services/scraper/tests/Rezio.Scraper.Domain.Tests/UnitTest1.cs`

**Interfaces:**
- Consumes: nic
- Produces: `enum ListingCategory { Apartament, DomDomek, Pokoj, HotelAparthotel, PensjonatWilla, Agroturystyka, GlampingNietypowe }`; `record RawListing(string ExternalRef, string Title, string PropertyType, IReadOnlyList<string> Amenities, int Guests, int Bedrooms)`; `record ClassifiedListing(RawListing Raw, ListingCategory Category, IReadOnlyList<string> Tags)`; `ClassifiedListing ListingClassifier.Classify(RawListing raw)`

Reguły klasyfikacji (wiążące; dopasowanie: `Contains` na złączonym, zlowercase'owanym tekście `title + " " + propertyType + " " + join(amenities)` — dalej „tekst"; kategoria wg pierwszej pasującej reguły w tej kolejności):
1. `Agroturystyka`: tekst zawiera `agroturystyka`, `gospodarstwo` lub `farm stay`
2. `GlampingNietypowe`: `glamping`, `jurta`, `yurt`, `treehouse`, `domek na drzewie` lub `tent`
3. `HotelAparthotel`: `hotel` lub `aparthotel`
4. `Pokoj`: `private_room` lub `shared_room` (bez gołego `pokój` — false positive na „pokój dzienny" w opisach apartamentów)
5. `PensjonatWilla`: `willa`, `villa`, `pensjonat` lub `guesthouse`
6. `DomDomek`: `domek`, `domku`, `chata`, `chałupa`, `chalet`, `cabin`, `cottage` lub `house`
7. domyślnie: `Apartament`

Tagi (niezależne od kategorii; tag dodawany, gdy tekst zawiera którekolwiek słowo z listy):
- `widok_gory`: `widok na góry`, `widokiem na góry`, `mountain view`, `tatr`, `karkonosze`, `bieszczady`, `pieniny`, `beskid`
- `widok_woda`: `widok na morze`, `widok na jezioro`, `sea view`, `lake view`, `nad jeziorem`, `nad morzem`
- `przy_stoku`: `przy stoku`, `ski-in`, `przy wyciągu`
- `blisko_plazy`: `przy plaży`, `blisko plaży`, `beachfront`, `dostęp do plaży`
- `sauna_balia`: `sauna`, `balia`
- `jacuzzi`: `jacuzzi`, `hot tub`, `whirlpool`
- `kominek`: `kominek`, `komink` (rdzeń odmian: kominkiem/kominka), `fireplace`
- `zwierzeta_ok`: `pets allowed`, `zwierzęta mile widziane`, `akceptujemy zwierzęta`
- `agro_zwierzeta`: `alpaki`, `kozy`, `kucyki`, `mini zoo`, `zwierzęta gospodarskie`

Kolejność tagów w wyniku: jak wyżej (stała kolejność skanowania).

- [ ] **Step 1: Failing golden testy**

```csharp
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class ListingClassifierTests
{
    private static RawListing Listing(string title, string type, params string[] amenities) =>
        new("syn_test_001", title, type, amenities, Guests: 4, Bedrooms: 2);

    [Fact]
    public void Mountain_cottage_with_fireplace_and_sauna()
    {
        var c = ListingClassifier.Classify(Listing("Domek z widokiem na Tatry", "entire_home/chalet", "fireplace", "sauna"));
        Assert.Equal(ListingCategory.DomDomek, c.Category);
        Assert.Contains("widok_gory", c.Tags);
        Assert.Contains("kominek", c.Tags);
        Assert.Contains("sauna_balia", c.Tags);
    }

    [Fact]
    public void Agrotourism_with_alpacas_wins_over_cottage()
    {
        var c = ListingClassifier.Classify(Listing("Agroturystyka u Basi – alpaki", "entire_home/cottage"));
        Assert.Equal(ListingCategory.Agroturystyka, c.Category);
        Assert.Contains("agro_zwierzeta", c.Tags);
    }

    [Fact]
    public void Plain_city_apartment_has_no_tags()
    {
        var c = ListingClassifier.Classify(Listing("Apartament w centrum", "entire_home/apartment"));
        Assert.Equal(ListingCategory.Apartament, c.Category);
        Assert.Empty(c.Tags);
    }

    [Fact]
    public void Private_room_is_pokoj()
    {
        var c = ListingClassifier.Classify(Listing("Przytulny pokój blisko dworca", "private_room"));
        Assert.Equal(ListingCategory.Pokoj, c.Category);
    }

    [Fact]
    public void Villa_near_beach_with_hot_tub()
    {
        var c = ListingClassifier.Classify(Listing("Willa Bałtyk przy plaży", "entire_home/villa", "hot tub"));
        Assert.Equal(ListingCategory.PensjonatWilla, c.Category);
        Assert.Contains("blisko_plazy", c.Tags);
        Assert.Contains("jacuzzi", c.Tags);
    }

    [Fact]
    public void Glamping_yurt_under_tatras()
    {
        var c = ListingClassifier.Classify(Listing("Glamping pod Tatrami – jurta", "tent"));
        Assert.Equal(ListingCategory.GlampingNietypowe, c.Category);
        Assert.Contains("widok_gory", c.Tags);
    }

    [Fact]
    public void Hotel_type_wins_over_mountain_sounding_title()
    {
        var c = ListingClassifier.Classify(Listing("Hotel Górski", "hotel_room"));
        Assert.Equal(ListingCategory.HotelAparthotel, c.Category);
    }

    [Fact]
    public void Matching_is_case_insensitive()
    {
        var c = ListingClassifier.Classify(Listing("DOMEK Z KOMINKIEM", "ENTIRE_HOME/CHALET"));
        Assert.Equal(ListingCategory.DomDomek, c.Category);
        Assert.Contains("kominek", c.Tags);
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/scraper/tests/Rezio.Scraper.Domain.Tests`
Expected: FAIL — brak typów

- [ ] **Step 3: Implementacja**

`ListingCategory.cs`:
```csharp
namespace Rezio.Scraper.Domain;

public enum ListingCategory
{
    Apartament, DomDomek, Pokoj, HotelAparthotel, PensjonatWilla, Agroturystyka, GlampingNietypowe
}
```

`RawListing.cs`:
```csharp
namespace Rezio.Scraper.Domain;

public sealed record RawListing(
    string ExternalRef,
    string Title,
    string PropertyType,
    IReadOnlyList<string> Amenities,
    int Guests,
    int Bedrooms);

public sealed record ClassifiedListing(
    RawListing Raw,
    ListingCategory Category,
    IReadOnlyList<string> Tags);
```

`ListingClassifier.cs`:
```csharp
namespace Rezio.Scraper.Domain;

public static class ListingClassifier
{
    private static readonly (ListingCategory Category, string[] Keywords)[] CategoryRules =
    [
        (ListingCategory.Agroturystyka,     ["agroturystyka", "gospodarstwo", "farm stay"]),
        (ListingCategory.GlampingNietypowe, ["glamping", "jurta", "yurt", "treehouse", "domek na drzewie", "tent"]),
        (ListingCategory.HotelAparthotel,   ["hotel", "aparthotel"]),
        (ListingCategory.Pokoj,             ["private_room", "shared_room"]),
        (ListingCategory.PensjonatWilla,    ["willa", "villa", "pensjonat", "guesthouse"]),
        (ListingCategory.DomDomek,          ["domek", "domku", "chata", "chałupa", "chalet", "cabin", "cottage", "house"]),
    ];

    private static readonly (string Tag, string[] Keywords)[] TagRules =
    [
        ("widok_gory",    ["widok na góry", "widokiem na góry", "mountain view", "tatr", "karkonosze", "bieszczady", "pieniny", "beskid"]),
        ("widok_woda",    ["widok na morze", "widok na jezioro", "sea view", "lake view", "nad jeziorem", "nad morzem"]),
        ("przy_stoku",    ["przy stoku", "ski-in", "przy wyciągu"]),
        ("blisko_plazy",  ["przy plaży", "blisko plaży", "beachfront", "dostęp do plaży"]),
        ("sauna_balia",   ["sauna", "balia"]),
        ("jacuzzi",       ["jacuzzi", "hot tub", "whirlpool"]),
        ("kominek",       ["kominek", "komink", "fireplace"]),
        ("zwierzeta_ok",  ["pets allowed", "zwierzęta mile widziane", "akceptujemy zwierzęta"]),
        ("agro_zwierzeta", ["alpaki", "kozy", "kucyki", "mini zoo", "zwierzęta gospodarskie"]),
    ];

    public static ClassifiedListing Classify(RawListing raw)
    {
        var text = $"{raw.Title} {raw.PropertyType} {string.Join(' ', raw.Amenities)}"
            .ToLowerInvariant();

        var category = ListingCategory.Apartament;
        foreach (var (cat, keywords) in CategoryRules)
        {
            if (keywords.Any(text.Contains)) { category = cat; break; }
        }

        var tags = TagRules
            .Where(rule => rule.Keywords.Any(text.Contains))
            .Select(rule => rule.Tag)
            .ToList();

        return new ClassifiedListing(raw, category, tags);
    }
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/scraper/tests/Rezio.Scraper.Domain.Tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: listing taxonomy classifier (category and tags, PL/EN rules)"
```

---

### Task 3: Agregacja obserwacji do statystyk dziennych rynku

**Files:**
- Create: `services/scraper/src/Rezio.Scraper.Domain/ListingDayObservation.cs`
- Create: `services/scraper/src/Rezio.Scraper.Domain/MarketDailyStats.cs`
- Create: `services/scraper/src/Rezio.Scraper.Domain/MarketAggregator.cs`
- Test: `services/scraper/tests/Rezio.Scraper.Domain.Tests/MarketAggregatorTests.cs`

**Interfaces:**
- Consumes: nic
- Produces: `record ListingDayObservation(string ExternalRef, DateOnly Date, decimal Price, bool Available)`; `record MarketDailyStats(DateOnly Date, decimal MedianPrice, double OccupancyRate, int ActiveListings)`; `IReadOnlyList<MarketDailyStats> MarketAggregator.Aggregate(IEnumerable<ListingDayObservation> observations)` (posortowane po dacie)

- [ ] **Step 1: Failing testy**

```csharp
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class MarketAggregatorTests
{
    private static ListingDayObservation Obs(string @ref, string date, decimal price, bool available) =>
        new(@ref, DateOnly.Parse(date), price, available);

    [Fact]
    public void Median_of_odd_count_available_prices()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-01", 100m, true),
            Obs("b", "2026-08-01", 300m, true),
            Obs("c", "2026-08-01", 200m, true),
        ]).Single();

        Assert.Equal(200m, stats.MedianPrice);
        Assert.Equal(0.0, stats.OccupancyRate);
        Assert.Equal(3, stats.ActiveListings);
    }

    [Fact]
    public void Median_of_even_count_is_average_of_middle_two()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-01", 100m, true),
            Obs("b", "2026-08-01", 200m, true),
            Obs("c", "2026-08-01", 300m, true),
            Obs("d", "2026-08-01", 400m, true),
        ]).Single();

        Assert.Equal(250m, stats.MedianPrice);
    }

    [Fact]
    public void Occupancy_counts_unavailable_share_and_median_uses_available_only()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-01", 100m, true),
            Obs("b", "2026-08-01", 200m, true),
            Obs("c", "2026-08-01", 999m, false),
        ]).Single();

        Assert.Equal(150m, stats.MedianPrice);              // mediana tylko z dostępnych
        Assert.Equal(1.0 / 3, stats.OccupancyRate, precision: 10);
        Assert.Equal(3, stats.ActiveListings);
    }

    [Fact]
    public void All_booked_falls_back_to_median_of_all_prices()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-01", 100m, false),
            Obs("b", "2026-08-01", 300m, false),
        ]).Single();

        Assert.Equal(200m, stats.MedianPrice);
        Assert.Equal(1.0, stats.OccupancyRate);
    }

    [Fact]
    public void Groups_by_date_and_sorts_ascending()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-02", 200m, true),
            Obs("a", "2026-08-01", 100m, true),
        ]);

        Assert.Equal(2, stats.Count);
        Assert.Equal(DateOnly.Parse("2026-08-01"), stats[0].Date);
        Assert.Equal(100m, stats[0].MedianPrice);
        Assert.Equal(DateOnly.Parse("2026-08-02"), stats[1].Date);
    }

    [Fact]
    public void Empty_input_returns_empty_list()
    {
        Assert.Empty(MarketAggregator.Aggregate([]));
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/scraper/tests/Rezio.Scraper.Domain.Tests`
Expected: FAIL — brak typów

- [ ] **Step 3: Implementacja**

`ListingDayObservation.cs`:
```csharp
namespace Rezio.Scraper.Domain;

public sealed record ListingDayObservation(
    string ExternalRef,
    DateOnly Date,
    decimal Price,
    bool Available);
```

`MarketDailyStats.cs`:
```csharp
namespace Rezio.Scraper.Domain;

public sealed record MarketDailyStats(
    DateOnly Date,
    decimal MedianPrice,
    double OccupancyRate,
    int ActiveListings);
```

`MarketAggregator.cs`:
```csharp
namespace Rezio.Scraper.Domain;

public static class MarketAggregator
{
    public static IReadOnlyList<MarketDailyStats> Aggregate(IEnumerable<ListingDayObservation> observations) =>
        observations
            .GroupBy(o => o.Date)
            .OrderBy(g => g.Key)
            .Select(g =>
            {
                var active = g.Count();
                var occupied = g.Count(o => !o.Available);
                var availablePrices = g.Where(o => o.Available).Select(o => o.Price).ToList();
                var prices = availablePrices.Count > 0
                    ? availablePrices
                    : g.Select(o => o.Price).ToList();

                return new MarketDailyStats(
                    g.Key,
                    Median(prices),
                    (double)occupied / active,
                    active);
            })
            .ToList();

    private static decimal Median(List<decimal> values)
    {
        values.Sort();
        var mid = values.Count / 2;
        return values.Count % 2 == 1
            ? values[mid]
            : (values[mid - 1] + values[mid]) / 2m;
    }
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/scraper/tests/Rezio.Scraper.Domain.Tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: market aggregator (median price, occupancy, active listings)"
```

---

### Task 4: Abstrakcja źródła + deterministyczne źródło syntetyczne

**Files:**
- Create: `services/scraper/src/Rezio.Scraper.Domain/IListingSource.cs`
- Create: `services/scraper/src/Rezio.Scraper.Domain/SyntheticListingSource.cs`
- Test: `services/scraper/tests/Rezio.Scraper.Domain.Tests/SyntheticListingSourceTests.cs`

**Interfaces:**
- Consumes: `RawListing`, `ListingDayObservation` (Taski 2–3)
- Produces:
  - `interface IListingSource { Task<IReadOnlyList<RawListing>> GetListingsAsync(string marketId, CancellationToken ct); Task<IReadOnlyList<ListingDayObservation>> GetCalendarAsync(RawListing listing, DateOnly from, DateOnly to, CancellationToken ct); }`
  - `class SyntheticListingSource : IListingSource` — wzory z Global Constraints; tytuły/typy cyklicznie per `i % 6` wg tabeli niżej; indeks `i` odtwarzany z `ExternalRef` (ostatnie 3 znaki)

| `i % 6` | Title | PropertyType |
|---|---|---|
| 1 | `Apartament w centrum {i}` | `entire_home/apartment` |
| 2 | `Domek z widokiem na Tatry {i}` | `entire_home/chalet` |
| 3 | `Przytulny pokój {i}` | `private_room` |
| 4 | `Willa przy plaży {i}` | `entire_home/villa` |
| 5 | `Agroturystyka pod lasem {i}` | `entire_home/cottage` |
| 0 | `Glamping – jurta {i}` | `tent` |

Amenities: `["sauna"]` gdy `i % 5 == 0`, w przeciwnym razie puste. `Guests = 2 + i % 6`, `Bedrooms = 1 + i % 3`.

- [ ] **Step 1: Failing testy**

```csharp
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class SyntheticListingSourceTests
{
    private readonly SyntheticListingSource _source = new();

    [Fact]
    public async Task Known_market_returns_30_deterministic_listings()
    {
        var first = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);
        var second = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);

        Assert.Equal(30, first.Count);
        Assert.Equal(first, second); // pełny determinizm (rekordy porównywane strukturalnie po ExternalRef itd.)
        Assert.Equal("syn_mkt_zakopane_001", first[0].ExternalRef);
    }

    [Fact]
    public async Task Unknown_market_returns_empty()
    {
        Assert.Empty(await _source.GetListingsAsync("mkt_nope", CancellationToken.None));
    }

    [Fact]
    public async Task Price_formula_weekday_and_weekend()
    {
        var listings = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);
        var l1 = listings[0]; // i = 1, cena bazowa 150 + 1*25 = 175
        var calendar = await _source.GetCalendarAsync(l1,
            DateOnly.Parse("2026-08-11"), DateOnly.Parse("2026-08-14"), CancellationToken.None);

        Assert.Equal(4, calendar.Count);
        Assert.Equal(175m, calendar[0].Price);  // wtorek 11.08 — cena bazowa
        Assert.Equal(210m, calendar[3].Price);  // piątek 14.08 — ×1.2
    }

    [Fact]
    public async Task Availability_formula_is_deterministic()
    {
        var listings = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);
        var l1 = listings[0]; // i = 1
        var date = DateOnly.Parse("2026-08-11");
        var expected = (1 * 31 + date.DayNumber * 7) % 10 >= 3;

        var day = (await _source.GetCalendarAsync(l1, date, date, CancellationToken.None)).Single();
        Assert.Equal(expected, day.Available);
    }

    [Fact]
    public async Task Listings_cycle_through_six_title_templates()
    {
        var listings = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);
        Assert.StartsWith("Apartament w centrum", listings[0].Title);   // i=1
        Assert.StartsWith("Domek z widokiem na Tatry", listings[1].Title); // i=2
        Assert.StartsWith("Glamping", listings[5].Title);               // i=6 → 6%6=0
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/scraper/tests/Rezio.Scraper.Domain.Tests`
Expected: FAIL

- [ ] **Step 3: Implementacja**

`IListingSource.cs`:
```csharp
namespace Rezio.Scraper.Domain;

public interface IListingSource
{
    Task<IReadOnlyList<RawListing>> GetListingsAsync(string marketId, CancellationToken ct);
    Task<IReadOnlyList<ListingDayObservation>> GetCalendarAsync(RawListing listing, DateOnly from, DateOnly to, CancellationToken ct);
}
```

`SyntheticListingSource.cs`:
```csharp
namespace Rezio.Scraper.Domain;

/// <summary>
/// Deterministyczne źródło danych rynkowych (bez sieci i bez Random) — stoi za tą samą
/// abstrakcją IListingSource, za którą wejdzie prawdziwy adapter Airbnb/Booking.
/// </summary>
public sealed class SyntheticListingSource : IListingSource
{
    private static readonly HashSet<string> KnownMarkets =
        ["mkt_zakopane", "mkt_gdansk", "mkt_krakow", "mkt_warszawa"];

    private static readonly (string Title, string Type)[] Templates =
    [
        ("Glamping – jurta {0}", "tent"),                          // i % 6 == 0
        ("Apartament w centrum {0}", "entire_home/apartment"),     // i % 6 == 1
        ("Domek z widokiem na Tatry {0}", "entire_home/chalet"),   // i % 6 == 2
        ("Przytulny pokój {0}", "private_room"),                   // i % 6 == 3
        ("Willa przy plaży {0}", "entire_home/villa"),             // i % 6 == 4
        ("Agroturystyka pod lasem {0}", "entire_home/cottage"),    // i % 6 == 5
    ];

    public Task<IReadOnlyList<RawListing>> GetListingsAsync(string marketId, CancellationToken ct)
    {
        if (!KnownMarkets.Contains(marketId))
            return Task.FromResult<IReadOnlyList<RawListing>>([]);

        var listings = Enumerable.Range(1, 30).Select(i =>
        {
            var (title, type) = Templates[i % 6];
            return new RawListing(
                ExternalRef: $"syn_{marketId}_{i:D3}",
                Title: string.Format(title, i),
                PropertyType: type,
                Amenities: i % 5 == 0 ? ["sauna"] : [],
                Guests: 2 + i % 6,
                Bedrooms: 1 + i % 3);
        }).ToList();

        return Task.FromResult<IReadOnlyList<RawListing>>(listings);
    }

    public Task<IReadOnlyList<ListingDayObservation>> GetCalendarAsync(
        RawListing listing, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var i = int.Parse(listing.ExternalRef[^3..]);
        var basePrice = 150m + i % 10 * 25m;

        var days = new List<ListingDayObservation>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var weekend = d.DayOfWeek is DayOfWeek.Friday or DayOfWeek.Saturday;
            var price = Math.Round(weekend ? basePrice * 1.2m : basePrice, 0, MidpointRounding.AwayFromZero);
            var available = (i * 31 + d.DayNumber * 7) % 10 >= 3;
            days.Add(new ListingDayObservation(listing.ExternalRef, d, price, available));
        }
        return Task.FromResult<IReadOnlyList<ListingDayObservation>>(days);
    }
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/scraper/tests/Rezio.Scraper.Domain.Tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: listing source abstraction with deterministic synthetic source"
```

---

### Task 5: ScrapeRunner + in-memory store statystyk

**Files:**
- Create: `services/scraper/src/Rezio.Scraper.Domain/IStatsStore.cs`
- Create: `services/scraper/src/Rezio.Scraper.Domain/InMemoryStatsStore.cs`
- Create: `services/scraper/src/Rezio.Scraper.Domain/ScrapeRunner.cs`
- Test: `services/scraper/tests/Rezio.Scraper.Domain.Tests/ScrapeRunnerTests.cs`

**Interfaces:**
- Consumes: `IListingSource`, `SyntheticListingSource`, `MarketAggregator`, `ListingClassifier` (Taski 2–4)
- Produces:
  - `interface IStatsStore { void Save(string marketId, IReadOnlyList<MarketDailyStats> stats); IReadOnlyList<MarketDailyStats> Get(string marketId, DateOnly from, DateOnly to); }`
  - `class InMemoryStatsStore : IStatsStore` (thread-safe, upsert per data)
  - `record ScrapeResult(string MarketId, int ListingsScraped, int DaysAggregated)`
  - `class ScrapeRunner(IListingSource source, IStatsStore store)` z metodą `Task<ScrapeResult> RunAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)` — pipeline: listings → klasyfikacja (na razie logowana wyłącznie w wyniku; persystencja per kategoria w planie Postgresa) → kalendarze → agregacja → zapis

- [ ] **Step 1: Failing testy**

```csharp
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class ScrapeRunnerTests
{
    [Fact]
    public async Task Run_populates_store_with_aggregated_stats()
    {
        var store = new InMemoryStatsStore();
        var runner = new ScrapeRunner(new SyntheticListingSource(), store);
        var from = DateOnly.Parse("2026-08-01");
        var to = DateOnly.Parse("2026-08-07");

        var result = await runner.RunAsync("mkt_zakopane", from, to, CancellationToken.None);

        Assert.Equal(30, result.ListingsScraped);
        Assert.Equal(7, result.DaysAggregated);

        var stats = store.Get("mkt_zakopane", from, to);
        Assert.Equal(7, stats.Count);
        Assert.All(stats, s => Assert.Equal(30, s.ActiveListings));
        Assert.All(stats, s => Assert.InRange(s.OccupancyRate, 0.0, 1.0));
        Assert.All(stats, s => Assert.True(s.MedianPrice > 0));
    }

    [Fact]
    public async Task Run_for_unknown_market_scrapes_nothing()
    {
        var store = new InMemoryStatsStore();
        var runner = new ScrapeRunner(new SyntheticListingSource(), store);

        var result = await runner.RunAsync("mkt_nope", DateOnly.Parse("2026-08-01"), DateOnly.Parse("2026-08-07"), CancellationToken.None);

        Assert.Equal(0, result.ListingsScraped);
        Assert.Equal(0, result.DaysAggregated);
        Assert.Empty(store.Get("mkt_nope", DateOnly.Parse("2026-08-01"), DateOnly.Parse("2026-08-07")));
    }

    [Fact]
    public async Task Second_run_upserts_same_dates_without_duplicates()
    {
        var store = new InMemoryStatsStore();
        var runner = new ScrapeRunner(new SyntheticListingSource(), store);
        var from = DateOnly.Parse("2026-08-01");
        var to = DateOnly.Parse("2026-08-03");

        await runner.RunAsync("mkt_gdansk", from, to, CancellationToken.None);
        await runner.RunAsync("mkt_gdansk", from, to, CancellationToken.None);

        Assert.Equal(3, store.Get("mkt_gdansk", from, to).Count);
    }

    [Fact]
    public void Store_get_filters_range_and_sorts()
    {
        var store = new InMemoryStatsStore();
        store.Save("m", [
            new MarketDailyStats(DateOnly.Parse("2026-08-03"), 100m, 0.5, 10),
            new MarketDailyStats(DateOnly.Parse("2026-08-01"), 100m, 0.5, 10),
            new MarketDailyStats(DateOnly.Parse("2026-08-02"), 100m, 0.5, 10),
        ]);

        var got = store.Get("m", DateOnly.Parse("2026-08-01"), DateOnly.Parse("2026-08-02"));
        Assert.Equal(2, got.Count);
        Assert.Equal(DateOnly.Parse("2026-08-01"), got[0].Date);
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/scraper/tests/Rezio.Scraper.Domain.Tests`
Expected: FAIL

- [ ] **Step 3: Implementacja**

`IStatsStore.cs`:
```csharp
namespace Rezio.Scraper.Domain;

public interface IStatsStore
{
    void Save(string marketId, IReadOnlyList<MarketDailyStats> stats);
    IReadOnlyList<MarketDailyStats> Get(string marketId, DateOnly from, DateOnly to);
}
```

`InMemoryStatsStore.cs`:
```csharp
using System.Collections.Concurrent;

namespace Rezio.Scraper.Domain;

public sealed class InMemoryStatsStore : IStatsStore
{
    private readonly ConcurrentDictionary<(string MarketId, DateOnly Date), MarketDailyStats> _stats = new();

    public void Save(string marketId, IReadOnlyList<MarketDailyStats> stats)
    {
        foreach (var s in stats)
            _stats[(marketId, s.Date)] = s;
    }

    public IReadOnlyList<MarketDailyStats> Get(string marketId, DateOnly from, DateOnly to) =>
        _stats
            .Where(kv => kv.Key.MarketId == marketId && kv.Key.Date >= from && kv.Key.Date <= to)
            .Select(kv => kv.Value)
            .OrderBy(s => s.Date)
            .ToList();
}
```

`ScrapeRunner.cs`:
```csharp
namespace Rezio.Scraper.Domain;

public sealed record ScrapeResult(string MarketId, int ListingsScraped, int DaysAggregated);

public sealed class ScrapeRunner(IListingSource source, IStatsStore store)
{
    public async Task<ScrapeResult> RunAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var listings = await source.GetListingsAsync(marketId, ct);
        if (listings.Count == 0)
            return new ScrapeResult(marketId, 0, 0);

        // Klasyfikacja per oferta — wynik będzie persystowany per kategoria/tag
        // w planie Postgresa (comp sets); tu napędza przyszłe agregaty segmentowe.
        _ = listings.Select(ListingClassifier.Classify).ToList();

        var observations = new List<ListingDayObservation>();
        foreach (var listing in listings)
        {
            ct.ThrowIfCancellationRequested();
            observations.AddRange(await source.GetCalendarAsync(listing, from, to, ct));
        }

        var stats = MarketAggregator.Aggregate(observations);
        store.Save(marketId, stats);
        return new ScrapeResult(marketId, listings.Count, stats.Count);
    }
}
```

- [ ] **Step 4: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scrape runner pipeline with in-memory stats store"
```

---

### Task 6: API — `POST /v1/scrape-jobs`, `GET /v1/markets/{id}/stats`, health, Serilog

**Files:**
- Create: `services/scraper/src/Rezio.Scraper.Api/Contracts.cs`
- Modify: `services/scraper/src/Rezio.Scraper.Api/Program.cs` (całość poniżej)
- Test: `services/scraper/tests/Rezio.Scraper.Api.Tests/ScraperEndpointTests.cs`
- Delete: `services/scraper/tests/Rezio.Scraper.Api.Tests/UnitTest1.cs`

**Interfaces:**
- Consumes: `ScrapeRunner`, `SyntheticListingSource`, `InMemoryStatsStore`, `IStatsStore`, `IListingSource`, `MarketDailyStats` (Taski 4–5)
- Produces: HTTP API snake_case — `POST /v1/scrape-jobs` (body `{market_id, from, to}` → `200 ScrapeResult` | 404 nieznany rynek | 400 zły zakres), `GET /v1/markets/{id}/stats?from=&to=` (`200 StatsResponse(string MarketId, IReadOnlyList<MarketDailyStats> Stats)` | 404 | 400), `GET /health`; znane rynki: te same 4 identyfikatory

- [ ] **Step 1: Dodaj pakiety (jak w pricing/demand)**

```bash
dotnet add services/scraper/src/Rezio.Scraper.Api package Serilog.AspNetCore
dotnet add services/scraper/src/Rezio.Scraper.Api package Serilog.Sinks.Grafana.Loki
dotnet add services/scraper/src/Rezio.Scraper.Api package AspNetCore.HealthChecks.UI.Client
```

- [ ] **Step 2: Failing testy integracyjne**

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Scraper.Api.Tests;

public class ScraperEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Scrape_job_then_stats_roundtrip()
    {
        var job = await _client.PostAsJsonAsync("/v1/scrape-jobs",
            new { market_id = "mkt_zakopane", from = "2026-08-01", to = "2026-08-07" });
        Assert.Equal(HttpStatusCode.OK, job.StatusCode);
        var jobJson = JsonNode.Parse(await job.Content.ReadAsStringAsync())!;
        Assert.Equal(30, (int)jobJson["listings_scraped"]!);
        Assert.Equal(7, (int)jobJson["days_aggregated"]!);

        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/stats?from=2026-08-01&to=2026-08-07");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("mkt_zakopane", (string)json["market_id"]!);
        var stats = json["stats"]!.AsArray();
        Assert.Equal(7, stats.Count);
        Assert.Equal(30, (int)stats[0]!["active_listings"]!);
        Assert.True((decimal)stats[0]!["median_price"]! > 0);
    }

    [Fact]
    public async Task Scrape_job_for_unknown_market_returns_404()
    {
        var resp = await _client.PostAsJsonAsync("/v1/scrape-jobs",
            new { market_id = "mkt_nope", from = "2026-08-01", to = "2026-08-07" });
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Stats_inverted_range_returns_400()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/stats?from=2026-08-07&to=2026-08-01");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Stats_for_unknown_market_returns_404()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_nope/stats?from=2026-08-01&to=2026-08-07");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
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

Run: `dotnet test services/scraper/tests/Rezio.Scraper.Api.Tests`
Expected: FAIL

- [ ] **Step 4: Implementacja**

`Contracts.cs`:
```csharp
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api;

public sealed record ScrapeJobRequest(string MarketId, DateOnly From, DateOnly To);

public sealed record StatsResponse(string MarketId, IReadOnlyList<MarketDailyStats> Stats);
```

`Program.cs` (całość):
```csharp
using System.Text.Json;
using HealthChecks.UI.Client;
using Rezio.Scraper.Api;
using Rezio.Scraper.Domain;
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
            labels: [new LokiLabel { Key = "service", Value = "scraper-api" }]);
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton<IListingSource, SyntheticListingSource>();
builder.Services.AddSingleton<IStatsStore, InMemoryStatsStore>();
builder.Services.AddSingleton<ScrapeRunner>();

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

string[] knownMarkets = ["mkt_zakopane", "mkt_gdansk", "mkt_krakow", "mkt_warszawa"];

IResult? ValidateRange(DateOnly from, DateOnly to) =>
    to < from || to.DayNumber - from.DayNumber >= 365
        ? Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.")
        : null;

app.MapPost("/v1/scrape-jobs", async (ScrapeJobRequest request, ScrapeRunner runner, CancellationToken ct) =>
{
    if (ValidateRange(request.From, request.To) is { } invalid)
        return invalid;

    if (!knownMarkets.Contains(request.MarketId))
        return Results.Problem(statusCode: 404, title: "Market not found");

    var result = await runner.RunAsync(request.MarketId, request.From, request.To, ct);
    return Results.Ok(result);
});

app.MapGet("/v1/markets/{id}/stats", (string id, DateOnly from, DateOnly to, IStatsStore store) =>
{
    if (ValidateRange(from, to) is { } invalid)
        return invalid;

    if (!knownMarkets.Contains(id))
        return Results.Problem(statusCode: 404, title: "Market not found");

    return Results.Ok(new StatsResponse(id, store.Get(id, from, to)));
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
git commit -m "feat: scraper api (scrape jobs, market stats, health, structured logging)"
```

---

### Task 7: Dockerfile, compose (scraper na :8082), README

**Files:**
- Create: `services/scraper/Dockerfile`
- Modify: `docker-compose.yml` (serwis `scraper-api` + wpis `__2__` w HealthChecks UI + `depends_on`)
- Modify: `README.md` (wiersz w tabeli usług)

**Interfaces:**
- Consumes: publikowalny `Rezio.Scraper.Api` (Task 6), compose z planów 1–2
- Produces: `docker compose up` podnosi scraper-api na `:8082`; HealthChecks UI monitoruje trzy serwisy

- [ ] **Step 1: `services/scraper/Dockerfile`**

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish services/scraper/src/Rezio.Scraper.Api -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Rezio.Scraper.Api.dll"]
```

- [ ] **Step 2: Rozszerz `docker-compose.yml`**

Nowy serwis (obok pricing-api/demand-api):

```yaml
  scraper-api:
    build:
      context: .
      dockerfile: services/scraper/Dockerfile
    ports:
      - "8082:8080"
    environment:
      LOKI_URL: http://loki:3100
    depends_on:
      - loki
```

W `healthchecks-ui.environment` dopisz:

```yaml
      HealthChecksUI__HealthChecks__2__Name: scraper-api
      HealthChecksUI__HealthChecks__2__Uri: http://scraper-api:8080/health
```

oraz w `healthchecks-ui.depends_on` dopisz `- scraper-api`.

- [ ] **Step 3: Zaktualizuj `README.md`**

Wiersz w tabeli usług (po Demand API):

```markdown
| Scraper API | http://localhost:8082 (przykład: `POST /v1/scrape-jobs`, potem `/v1/markets/mkt_zakopane/stats?from=2026-08-01&to=2026-08-07`) |
```

- [ ] **Step 4: Odpal cały system i zweryfikuj**

Run: `docker compose up --build -d`, potem:
- `curl -X POST http://localhost:8082/v1/scrape-jobs -H "Content-Type: application/json" -d '{"market_id":"mkt_zakopane","from":"2026-08-01","to":"2026-08-07"}'` → 200, `listings_scraped: 30`
- `curl "http://localhost:8082/v1/markets/mkt_zakopane/stats?from=2026-08-01&to=2026-08-07"` → 200, 7 pozycji stats
- `curl http://localhost:8082/health` → Healthy
- demand `:8081` i pricing (przez sieć kontenerów, jeśli host `:8080` nadal zajęty przez MTAgentService) dalej działają
- HealthChecks UI pokazuje TRZY serwisy Healthy (przez sieć kontenerów — host `:8090` zajmuje lokalny nginx)
- Loki: `{service="scraper-api"}` zwraca logi

Na koniec: `docker compose down`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add scraper-api to compose stack and README"
```

---

## Poza zakresem tego planu (kolejne plany)

- **Prawdziwe adaptery Airbnb/Booking** za `IListingSource` (Playwright, pula proxy residential — decyzja kosztowa użytkownika), rotacja fingerprintów, harmonogram per rynek
- Persystencja (Postgres/EF Core): `scraped_listings`, `scraped_listing_daily`, agregaty per comp set; obecnie klasyfikacja liczona, ale niepersystowana
- Harmonogram cykliczny (Quartz.NET) — teraz trigger ręczny `POST /v1/scrape-jobs`
- Zdarzenie `market.stats.updated` (RabbitMQ) — plan integracyjny
- Comp sets (agregaty per kategoria/tagi/promień) — plan Postgresa
