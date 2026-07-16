# Rezio MVP — Plan 2: demand-service (heurystyka popytu: święta, długie weekendy, ferie)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drugi mikroserwis `demand-service`: liczy `demand_score` (0–100) per rynek per data z sygnałów kalendarzowych PL (święta z ruchomą Wielkanocą, długie weekendy, mostki, przedświęta, ferie zimowe per województwo) i wystawia go przez `GET /v1/markets/{id}/demand`, z wagami per typ rynku.

**Architecture:** Lustrzana struktura do pricing: czysta domena `Rezio.Demand.Domain` (kalendarz świąt z algorytmem wielkanocnym, klasyfikacja dni, ferie MEN 2026, kalkulator score'a) + minimal API `Rezio.Demand.Api` z in-memory rejestrem rynków. Serwis nie ma zależności od zegara (czysta funkcja daty) ani od pricing — integracja zdarzeniami w późniejszym planie. `MarketType` celowo zduplikowany z pricing (serwisy niezależne; kontrakty przez JSON, nie współdzielone biblioteki).

**Kluczowa zasada domenowa:** demand_score mierzy *odchylenia* popytu od normy (święta/ferie/mostki), NIE sezonowość i NIE dzień tygodnia — te są już w mnożnikach pricing (SeasonFactor, DayOfWeekFactor). Baseline = 50 (neutralnie).

**Tech Stack:** .NET 10, C#, ASP.NET Core minimal APIs, xUnit, Microsoft.AspNetCore.Mvc.Testing, Serilog (+ sink Loki), ASP.NET Core HealthChecks, Docker Compose.

## Global Constraints

- TargetFramework: `net10.0` (dziedziczone z `Directory.Build.props`); `TreatWarningsAsErrors=true`
- Testy: xUnit; komenda: `dotnet test`
- JSON w API: snake_case (`JsonNamingPolicy.SnakeCaseLower`), błędy problem+json (`AddProblemDetails`)
- Daty: `DateOnly`; serwis NIE używa zegara (żadnego `TimeProvider`/`DateTime.Now` — wynik zależy tylko od parametrów)
- Układ monorepo: `services/demand/src/*`, `services/demand/tests/*`; dopisanie do `Rezio.slnx`
- Limit zakresu dat w API: identyczny jak w pricing — `to < from || to.DayNumber - from.DayNumber >= 365` → 400
- Wagi sygnałów per typ rynku (tabela — wartości wiążące):

| Sygnał | Mountains | Seaside | CityTourist | CityBusiness |
|---|---|---|---|---|
| Święto (dzień ustawowo wolny) | +15 | +10 | +12 | −8 |
| Dzień w długim weekendzie (ciąg wolnych+mostków ≥ 3 dni) | +25 | +20 | +18 | −10 |
| Mostek (dzień roboczy między dniami wolnymi) | +20 | +15 | +12 | −5 |
| Przeddzień święta (dzień roboczy przed świętem) | +8 | +5 | +6 | 0 |
| Ferie zimowe (województwo rynku) | +25 | +5 | +8 | 0 |

- Sygnały kalendarzowe (pierwsze 4) NIE sumują się — wybieramy wg priorytetu: długi weekend > mostek > święto > przeddzień. Ferie sumują się z sygnałem kalendarzowym. `score = clamp(50 + sygnał_kalendarzowy + ferie, 0, 100)`
- Drivers (lista stringów w odpowiedzi): nazwa święta (gdy święto), `"długi weekend"`, `"mostek"`, `"przeddzień święta"`, `"ferie zimowe (<województwo>)"` — wszystkie, które dotyczą danego dnia
- Ferie zimowe 2026 wg MEN (podział na 3 tury; źródło: rozporządzenie MEN, potwierdzone 2026-07-16):
  - 19.01–01.02.2026: mazowieckie, pomorskie, podlaskie, świętokrzyskie, warmińsko-mazurskie
  - 02.02–15.02.2026: dolnośląskie, kujawsko-pomorskie, łódzkie, zachodniopomorskie, małopolskie, opolskie
  - 16.02–01.03.2026: podkarpackie, lubelskie, wielkopolskie, lubuskie, śląskie
  - Rok bez danych w słowniku → `false` (bezpieczna degradacja). Odświeżenie: coroczny task operacyjny.
- Commit po każdym tasku; komunikaty `feat:`/`chore:`/`test:`

---

### Task 1: Scaffold projektów demand

**Files:**
- Create (szablonami): `services/demand/src/Rezio.Demand.Domain/`, `services/demand/src/Rezio.Demand.Api/`, `services/demand/tests/Rezio.Demand.Domain.Tests/`, `services/demand/tests/Rezio.Demand.Api.Tests/`
- Modify: `Rezio.slnx` (przez `dotnet sln add`)

**Interfaces:**
- Consumes: istniejąca solucja `Rezio.slnx`, `Directory.Build.props` w korzeniu
- Produces: budowalne 4 projekty; kolejne taski dopisują pliki

- [ ] **Step 1: Utwórz projekty i podepnij do solucji**

```bash
dotnet new classlib -n Rezio.Demand.Domain -o services/demand/src/Rezio.Demand.Domain
dotnet new web      -n Rezio.Demand.Api    -o services/demand/src/Rezio.Demand.Api
dotnet new xunit    -n Rezio.Demand.Domain.Tests -o services/demand/tests/Rezio.Demand.Domain.Tests
dotnet new xunit    -n Rezio.Demand.Api.Tests    -o services/demand/tests/Rezio.Demand.Api.Tests
dotnet sln Rezio.slnx add services/demand/src/Rezio.Demand.Domain services/demand/src/Rezio.Demand.Api services/demand/tests/Rezio.Demand.Domain.Tests services/demand/tests/Rezio.Demand.Api.Tests
dotnet add services/demand/src/Rezio.Demand.Api reference services/demand/src/Rezio.Demand.Domain
dotnet add services/demand/tests/Rezio.Demand.Domain.Tests reference services/demand/src/Rezio.Demand.Domain
dotnet add services/demand/tests/Rezio.Demand.Api.Tests reference services/demand/src/Rezio.Demand.Api
dotnet add services/demand/tests/Rezio.Demand.Api.Tests package Microsoft.AspNetCore.Mvc.Testing
```

- [ ] **Step 2: Wyczyść szablony jak w pricing (wzorzec z Task 1 planu 1)**

Usuń `Class1.cs` z Domain. Z czterech nowych `.csproj` usuń zduplikowane `<TargetFramework>`, `<Nullable>`, `<ImplicitUsings>` (ustawia je `Directory.Build.props`; puste `<PropertyGroup>` też usuń). Zostaw `UnitTest1.cs` w obu projektach testowych jako smoke.

- [ ] **Step 3: Zbuduj i odpal testy**

Run: `dotnet build && dotnet test`
Expected: build OK; 42 testy PASS (40 istniejących + 2 puste `UnitTest1`)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold demand service skeleton"
```

---

### Task 2: Kalendarz polskich świąt (stałe + ruchome od Wielkanocy)

**Files:**
- Create: `services/demand/src/Rezio.Demand.Domain/Holiday.cs`
- Create: `services/demand/src/Rezio.Demand.Domain/PolishHolidayCalendar.cs`
- Test: `services/demand/tests/Rezio.Demand.Domain.Tests/PolishHolidayCalendarTests.cs`
- Delete: `services/demand/tests/Rezio.Demand.Domain.Tests/UnitTest1.cs`

**Interfaces:**
- Consumes: nic
- Produces: `record Holiday(DateOnly Date, string Name)`; `DateOnly PolishHolidayCalendar.EasterSunday(int year)`; `IReadOnlyList<Holiday> PolishHolidayCalendar.ForYear(int year)` (posortowane po dacie)

- [ ] **Step 1: Failing testy**

```csharp
using Rezio.Demand.Domain;

namespace Rezio.Demand.Domain.Tests;

public class PolishHolidayCalendarTests
{
    [Theory]
    [InlineData(2025, "2025-04-20")]
    [InlineData(2026, "2026-04-05")]
    [InlineData(2027, "2027-03-28")]
    public void Easter_sunday_matches_known_dates(int year, string expected) =>
        Assert.Equal(DateOnly.Parse(expected), PolishHolidayCalendar.EasterSunday(year));

    [Fact]
    public void Year_2026_has_14_holidays_including_wigilia()
    {
        var holidays = PolishHolidayCalendar.ForYear(2026);
        Assert.Equal(14, holidays.Count);
        Assert.Contains(holidays, h => h.Date == new DateOnly(2026, 12, 24) && h.Name == "Wigilia");
        Assert.Contains(holidays, h => h.Date == new DateOnly(2026, 6, 4) && h.Name == "Boże Ciało");
        Assert.Contains(holidays, h => h.Date == new DateOnly(2026, 5, 24) && h.Name == "Zielone Świątki");
        Assert.Contains(holidays, h => h.Date == new DateOnly(2026, 4, 6) && h.Name == "Poniedziałek Wielkanocny");
    }

    [Fact]
    public void Year_2024_has_13_holidays_without_wigilia()
    {
        var holidays = PolishHolidayCalendar.ForYear(2024);
        Assert.Equal(13, holidays.Count);
        Assert.DoesNotContain(holidays, h => h.Date == new DateOnly(2024, 12, 24));
    }

    [Fact]
    public void Holidays_are_sorted_by_date()
    {
        var holidays = PolishHolidayCalendar.ForYear(2026);
        Assert.Equal(holidays.OrderBy(h => h.Date).Select(h => h.Date), holidays.Select(h => h.Date));
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/demand/tests/Rezio.Demand.Domain.Tests`
Expected: FAIL — brak `PolishHolidayCalendar`

- [ ] **Step 3: Implementacja**

`Holiday.cs`:
```csharp
namespace Rezio.Demand.Domain;

public sealed record Holiday(DateOnly Date, string Name);
```

`PolishHolidayCalendar.cs`:
```csharp
namespace Rezio.Demand.Domain;

public static class PolishHolidayCalendar
{
    // Algorytm anonimowy (Meeus/Jones/Butcher) dla kalendarza gregoriańskiego
    public static DateOnly EasterSunday(int year)
    {
        int a = year % 19, b = year / 100, c = year % 100;
        int d = b / 4, e = b % 4, f = (b + 8) / 25, g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4, k = c % 4;
        int l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31;
        int day = (h + l - 7 * m + 114) % 31 + 1;
        return new DateOnly(year, month, day);
    }

    public static IReadOnlyList<Holiday> ForYear(int year)
    {
        var easter = EasterSunday(year);
        var holidays = new List<Holiday>
        {
            new(new DateOnly(year, 1, 1), "Nowy Rok"),
            new(new DateOnly(year, 1, 6), "Trzech Króli"),
            new(easter, "Wielkanoc"),
            new(easter.AddDays(1), "Poniedziałek Wielkanocny"),
            new(new DateOnly(year, 5, 1), "Święto Pracy"),
            new(new DateOnly(year, 5, 3), "Święto Konstytucji 3 Maja"),
            new(easter.AddDays(49), "Zielone Świątki"),
            new(easter.AddDays(60), "Boże Ciało"),
            new(new DateOnly(year, 8, 15), "Wniebowzięcie NMP"),
            new(new DateOnly(year, 11, 1), "Wszystkich Świętych"),
            new(new DateOnly(year, 11, 11), "Święto Niepodległości"),
            new(new DateOnly(year, 12, 25), "Boże Narodzenie"),
            new(new DateOnly(year, 12, 26), "Drugi dzień Świąt"),
        };
        if (year >= 2025)
            holidays.Add(new Holiday(new DateOnly(year, 12, 24), "Wigilia")); // ustawowo wolna od 2025

        return holidays.OrderBy(h => h.Date).ToList();
    }
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/demand/tests/Rezio.Demand.Domain.Tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: polish holiday calendar with computed Easter-based movable feasts"
```

---

### Task 3: Klasyfikacja dni — wolne, mostki, długie weekendy, przedświęta

**Files:**
- Create: `services/demand/src/Rezio.Demand.Domain/DaySignals.cs`
- Create: `services/demand/src/Rezio.Demand.Domain/CalendarSignals.cs`
- Test: `services/demand/tests/Rezio.Demand.Domain.Tests/CalendarSignalsTests.cs`

**Interfaces:**
- Consumes: `PolishHolidayCalendar.ForYear(int)` z Task 2
- Produces: `record DaySignals(DateOnly Date, bool IsHoliday, string? HolidayName, bool InLongWeekend, bool IsBridge, bool IsHolidayEve)`; `IReadOnlyList<DaySignals> CalendarSignals.ForRange(DateOnly from, DateOnly to)` (jeden element per dzień, włącznie)

Definicje (wiążące):
- **wolny**: sobota, niedziela lub święto
- **mostek**: dzień roboczy, którego poprzedni i następny dzień są wolne
- **rozszerzony wolny**: wolny lub mostek
- **długi weekend**: każdy dzień w ciągu rozszerzonych wolnych o długości ≥ 3
- **przeddzień święta**: dzień, który sam NIE jest rozszerzonym wolnym, a następny dzień jest świętem
- Ciągi liczone z kontekstem ±7 dni poza zakresem (żeby dzień na krawędzi zakresu dostał poprawny sygnał)

- [ ] **Step 1: Failing testy**

```csharp
using Rezio.Demand.Domain;

namespace Rezio.Demand.Domain.Tests;

public class CalendarSignalsTests
{
    private static DaySignals For(string date)
    {
        var d = DateOnly.Parse(date);
        return CalendarSignals.ForRange(d, d).Single();
    }

    [Fact]
    public void Boze_cialo_2026_is_holiday_in_long_weekend()
    {
        var s = For("2026-06-04"); // czwartek, Boże Ciało; piątek = mostek, potem weekend => ciąg 4 dni
        Assert.True(s.IsHoliday);
        Assert.Equal("Boże Ciało", s.HolidayName);
        Assert.True(s.InLongWeekend);
        Assert.False(s.IsBridge);
        Assert.False(s.IsHolidayEve);
    }

    [Fact]
    public void Friday_after_boze_cialo_is_bridge_in_long_weekend()
    {
        var s = For("2026-06-05");
        Assert.False(s.IsHoliday);
        Assert.True(s.IsBridge);
        Assert.True(s.InLongWeekend);
    }

    [Fact]
    public void Majowka_friday_2026_is_holiday_in_long_weekend()
    {
        var s = For("2026-05-01"); // piątek, Święto Pracy + weekend => ciąg 3 dni
        Assert.True(s.IsHoliday);
        Assert.True(s.InLongWeekend);
    }

    [Fact]
    public void Assumption_2026_on_saturday_is_holiday_but_not_long_weekend()
    {
        var s = For("2026-08-15"); // sobota; ciąg sob+niedz = 2 dni
        Assert.True(s.IsHoliday);
        Assert.False(s.InLongWeekend);
    }

    [Fact]
    public void Day_before_assumption_2026_is_holiday_eve_only()
    {
        var s = For("2026-08-14"); // piątek roboczy przed sobotnim świętem
        Assert.False(s.IsHoliday);
        Assert.False(s.IsBridge);
        Assert.False(s.InLongWeekend);
        Assert.True(s.IsHolidayEve);
    }

    [Fact]
    public void Ordinary_tuesday_has_no_signals()
    {
        var s = For("2026-03-10");
        Assert.Equal(new DaySignals(DateOnly.Parse("2026-03-10"), false, null, false, false, false), s);
    }

    [Fact]
    public void Range_returns_one_entry_per_day_inclusive()
    {
        var list = CalendarSignals.ForRange(DateOnly.Parse("2026-06-01"), DateOnly.Parse("2026-06-07"));
        Assert.Equal(7, list.Count);
        Assert.Equal(DateOnly.Parse("2026-06-01"), list[0].Date);
        Assert.Equal(DateOnly.Parse("2026-06-07"), list[6].Date);
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/demand/tests/Rezio.Demand.Domain.Tests`
Expected: FAIL — brak `DaySignals`, `CalendarSignals`

- [ ] **Step 3: Implementacja**

`DaySignals.cs`:
```csharp
namespace Rezio.Demand.Domain;

public sealed record DaySignals(
    DateOnly Date,
    bool IsHoliday,
    string? HolidayName,
    bool InLongWeekend,
    bool IsBridge,
    bool IsHolidayEve);
```

`CalendarSignals.cs`:
```csharp
namespace Rezio.Demand.Domain;

public static class CalendarSignals
{
    public static IReadOnlyList<DaySignals> ForRange(DateOnly from, DateOnly to)
    {
        var contextStart = from.AddDays(-7);
        var contextEnd = to.AddDays(7);
        var holidays = Enumerable.Range(contextStart.Year, contextEnd.Year - contextStart.Year + 1)
            .SelectMany(PolishHolidayCalendar.ForYear)
            .ToDictionary(h => h.Date, h => h.Name);

        bool IsFree(DateOnly d) =>
            d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday || holidays.ContainsKey(d);

        bool IsBridge(DateOnly d) =>
            !IsFree(d) && IsFree(d.AddDays(-1)) && IsFree(d.AddDays(1));

        bool IsExtendedFree(DateOnly d) => IsFree(d) || IsBridge(d);

        var result = new List<DaySignals>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var inLongWeekend = false;
            if (IsExtendedFree(d))
            {
                var run = 1;
                for (var b = d.AddDays(-1); IsExtendedFree(b); b = b.AddDays(-1)) run++;
                for (var f = d.AddDays(1); IsExtendedFree(f); f = f.AddDays(1)) run++;
                inLongWeekend = run >= 3;
            }

            var isHolidayEve = !IsExtendedFree(d) && holidays.ContainsKey(d.AddDays(1));

            result.Add(new DaySignals(
                d,
                holidays.ContainsKey(d),
                holidays.GetValueOrDefault(d),
                inLongWeekend,
                IsBridge(d),
                isHolidayEve));
        }
        return result;
    }
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/demand/tests/Rezio.Demand.Domain.Tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: day classification (free days, bridges, long weekends, holiday eves)"
```

---

### Task 4: Ferie zimowe per województwo (dane MEN 2026)

**Files:**
- Create: `services/demand/src/Rezio.Demand.Domain/Voivodeship.cs`
- Create: `services/demand/src/Rezio.Demand.Domain/WinterBreakCalendar.cs`
- Test: `services/demand/tests/Rezio.Demand.Domain.Tests/WinterBreakCalendarTests.cs`

**Interfaces:**
- Consumes: nic
- Produces: `enum Voivodeship` (16 wartości); `bool WinterBreakCalendar.Covers(Voivodeship voivodeship, DateOnly date)`; `string VoivodeshipNames.Polish(Voivodeship)` (np. `Malopolskie` → `"małopolskie"`)

- [ ] **Step 1: Failing testy**

```csharp
using Rezio.Demand.Domain;

namespace Rezio.Demand.Domain.Tests;

public class WinterBreakCalendarTests
{
    [Theory]
    [InlineData(Voivodeship.Malopolskie, "2026-02-03", true)]   // tura 2: 02.02-15.02
    [InlineData(Voivodeship.Malopolskie, "2026-02-15", true)]   // ostatni dzień tury 2
    [InlineData(Voivodeship.Malopolskie, "2026-01-25", false)]  // tura 1 nie obejmuje małopolskiego
    [InlineData(Voivodeship.Mazowieckie, "2026-01-25", true)]   // tura 1: 19.01-01.02
    [InlineData(Voivodeship.Slaskie, "2026-02-20", true)]       // tura 3: 16.02-01.03
    [InlineData(Voivodeship.Slaskie, "2026-03-01", true)]       // ostatni dzień tury 3
    [InlineData(Voivodeship.Pomorskie, "2026-02-20", false)]    // pomorskie było w turze 1
    [InlineData(Voivodeship.Malopolskie, "2026-07-15", false)]  // lato — nie ferie zimowe
    public void Covers_matches_men_2026_schedule(Voivodeship v, string date, bool expected) =>
        Assert.Equal(expected, WinterBreakCalendar.Covers(v, DateOnly.Parse(date)));

    [Fact]
    public void Unknown_year_returns_false()
    {
        Assert.False(WinterBreakCalendar.Covers(Voivodeship.Malopolskie, new DateOnly(2031, 2, 3)));
    }

    [Fact]
    public void Polish_names_are_lowercase_with_diacritics()
    {
        Assert.Equal("małopolskie", VoivodeshipNames.Polish(Voivodeship.Malopolskie));
        Assert.Equal("warmińsko-mazurskie", VoivodeshipNames.Polish(Voivodeship.WarminskoMazurskie));
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/demand/tests/Rezio.Demand.Domain.Tests`
Expected: FAIL — brak typów

- [ ] **Step 3: Implementacja**

`Voivodeship.cs`:
```csharp
namespace Rezio.Demand.Domain;

public enum Voivodeship
{
    Dolnoslaskie, KujawskoPomorskie, Lubelskie, Lubuskie, Lodzkie, Malopolskie,
    Mazowieckie, Opolskie, Podkarpackie, Podlaskie, Pomorskie, Slaskie,
    Swietokrzyskie, WarminskoMazurskie, Wielkopolskie, Zachodniopomorskie
}

public static class VoivodeshipNames
{
    private static readonly IReadOnlyDictionary<Voivodeship, string> Names =
        new Dictionary<Voivodeship, string>
        {
            [Voivodeship.Dolnoslaskie] = "dolnośląskie",
            [Voivodeship.KujawskoPomorskie] = "kujawsko-pomorskie",
            [Voivodeship.Lubelskie] = "lubelskie",
            [Voivodeship.Lubuskie] = "lubuskie",
            [Voivodeship.Lodzkie] = "łódzkie",
            [Voivodeship.Malopolskie] = "małopolskie",
            [Voivodeship.Mazowieckie] = "mazowieckie",
            [Voivodeship.Opolskie] = "opolskie",
            [Voivodeship.Podkarpackie] = "podkarpackie",
            [Voivodeship.Podlaskie] = "podlaskie",
            [Voivodeship.Pomorskie] = "pomorskie",
            [Voivodeship.Slaskie] = "śląskie",
            [Voivodeship.Swietokrzyskie] = "świętokrzyskie",
            [Voivodeship.WarminskoMazurskie] = "warmińsko-mazurskie",
            [Voivodeship.Wielkopolskie] = "wielkopolskie",
            [Voivodeship.Zachodniopomorskie] = "zachodniopomorskie",
        };

    public static string Polish(Voivodeship voivodeship) => Names[voivodeship];
}
```

`WinterBreakCalendar.cs`:
```csharp
namespace Rezio.Demand.Domain;

public static class WinterBreakCalendar
{
    // Harmonogram MEN; odświeżany corocznie (rok bez wpisu => brak sygnału ferii).
    private static readonly IReadOnlyDictionary<int, (DateOnly From, DateOnly To, Voivodeship[] Regions)[]> Schedule =
        new Dictionary<int, (DateOnly, DateOnly, Voivodeship[])[]>
        {
            [2026] =
            [
                (new DateOnly(2026, 1, 19), new DateOnly(2026, 2, 1),
                    [Voivodeship.Mazowieckie, Voivodeship.Pomorskie, Voivodeship.Podlaskie,
                     Voivodeship.Swietokrzyskie, Voivodeship.WarminskoMazurskie]),
                (new DateOnly(2026, 2, 2), new DateOnly(2026, 2, 15),
                    [Voivodeship.Dolnoslaskie, Voivodeship.KujawskoPomorskie, Voivodeship.Lodzkie,
                     Voivodeship.Zachodniopomorskie, Voivodeship.Malopolskie, Voivodeship.Opolskie]),
                (new DateOnly(2026, 2, 16), new DateOnly(2026, 3, 1),
                    [Voivodeship.Podkarpackie, Voivodeship.Lubelskie, Voivodeship.Wielkopolskie,
                     Voivodeship.Lubuskie, Voivodeship.Slaskie]),
            ],
        };

    public static bool Covers(Voivodeship voivodeship, DateOnly date) =>
        Schedule.TryGetValue(date.Year, out var rows) &&
        rows.Any(r => date >= r.From && date <= r.To && r.Regions.Contains(voivodeship));
}
```

- [ ] **Step 4: Testy zielone**

Run: `dotnet test services/demand/tests/Rezio.Demand.Domain.Tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: winter break calendar per voivodeship (MEN 2026 schedule)"
```

---

### Task 5: Kalkulator demand score (wagi per typ rynku)

**Files:**
- Create: `services/demand/src/Rezio.Demand.Domain/MarketType.cs`
- Create: `services/demand/src/Rezio.Demand.Domain/DemandWeights.cs`
- Create: `services/demand/src/Rezio.Demand.Domain/DemandScoreCalculator.cs`
- Test: `services/demand/tests/Rezio.Demand.Domain.Tests/DemandScoreCalculatorTests.cs`

**Interfaces:**
- Consumes: `DaySignals` (Task 3), `Voivodeship`/`VoivodeshipNames`/`WinterBreakCalendar` (Task 4)
- Produces: `enum MarketType { Mountains, Seaside, CityBusiness, CityTourist }` (duplikat z pricing — celowo, serwisy niezależne); `record SignalWeights(int Holiday, int LongWeekend, int Bridge, int HolidayEve, int WinterBreak)`; `IReadOnlyDictionary<MarketType, SignalWeights> DemandWeights.ByMarketType`; `record DemandScore(DateOnly Date, int Score, IReadOnlyList<string> Drivers)`; `DemandScore DemandScoreCalculator.Score(MarketType marketType, Voivodeship voivodeship, DaySignals signals)`

- [ ] **Step 1: Failing golden testy (wartości z tabeli wag w Global Constraints)**

```csharp
using Rezio.Demand.Domain;

namespace Rezio.Demand.Domain.Tests;

public class DemandScoreCalculatorTests
{
    private static DemandScore ScoreFor(MarketType type, Voivodeship v, string date)
    {
        var d = DateOnly.Parse(date);
        var signals = CalendarSignals.ForRange(d, d).Single();
        return DemandScoreCalculator.Score(type, v, signals);
    }

    [Fact]
    public void Mountains_boze_cialo_long_weekend() // 50 + 25 (długi weekend ma priorytet nad świętem)
    {
        var s = ScoreFor(MarketType.Mountains, Voivodeship.Malopolskie, "2026-06-04");
        Assert.Equal(75, s.Score);
        Assert.Equal(new[] { "Boże Ciało", "długi weekend" }, s.Drivers);
    }

    [Fact]
    public void Mountains_bridge_day_gets_long_weekend_weight() // piątek po Bożym Ciele: 50 + 25
    {
        var s = ScoreFor(MarketType.Mountains, Voivodeship.Malopolskie, "2026-06-05");
        Assert.Equal(75, s.Score);
        Assert.Equal(new[] { "długi weekend", "mostek" }, s.Drivers);
    }

    [Fact]
    public void City_business_drops_on_long_weekend() // 50 - 10
    {
        var s = ScoreFor(MarketType.CityBusiness, Voivodeship.Mazowieckie, "2026-06-04");
        Assert.Equal(40, s.Score);
    }

    [Fact]
    public void Seaside_holiday_without_long_weekend() // 15.08 sobota: 50 + 10
    {
        var s = ScoreFor(MarketType.Seaside, Voivodeship.Pomorskie, "2026-08-15");
        Assert.Equal(60, s.Score);
        Assert.Equal(new[] { "Wniebowzięcie NMP" }, s.Drivers);
    }

    [Fact]
    public void Seaside_holiday_eve() // 14.08 piątek: 50 + 5
    {
        var s = ScoreFor(MarketType.Seaside, Voivodeship.Pomorskie, "2026-08-14");
        Assert.Equal(55, s.Score);
        Assert.Equal(new[] { "przeddzień święta" }, s.Drivers);
    }

    [Fact]
    public void Mountains_winter_break_adds_25() // zwykły wtorek w ferie małopolskie: 50 + 0 + 25
    {
        var s = ScoreFor(MarketType.Mountains, Voivodeship.Malopolskie, "2026-02-03");
        Assert.Equal(75, s.Score);
        Assert.Equal(new[] { "ferie zimowe (małopolskie)" }, s.Drivers);
    }

    [Fact]
    public void Ordinary_day_is_baseline_50()
    {
        var s = ScoreFor(MarketType.CityTourist, Voivodeship.Malopolskie, "2026-03-10");
        Assert.Equal(50, s.Score);
        Assert.Empty(s.Drivers);
    }

    [Fact]
    public void Majowka_friday_mountains() // 1.05 piątek: długi weekend 50 + 25
    {
        var s = ScoreFor(MarketType.Mountains, Voivodeship.Malopolskie, "2026-05-01");
        Assert.Equal(75, s.Score);
        Assert.Equal(new[] { "Święto Pracy", "długi weekend" }, s.Drivers);
    }
}
```

- [ ] **Step 2: Uruchom — FAIL kompilacją**

Run: `dotnet test services/demand/tests/Rezio.Demand.Domain.Tests`
Expected: FAIL — brak typów

- [ ] **Step 3: Implementacja**

`MarketType.cs`:
```csharp
namespace Rezio.Demand.Domain;

// Celowy duplikat enuma z Rezio.Pricing.Domain — serwisy nie współdzielą bibliotek,
// kontrakty wymieniają przez JSON (przyszłe zdarzenia demand.score.updated).
public enum MarketType { Mountains, Seaside, CityBusiness, CityTourist }
```

`DemandWeights.cs`:
```csharp
namespace Rezio.Demand.Domain;

public sealed record SignalWeights(int Holiday, int LongWeekend, int Bridge, int HolidayEve, int WinterBreak);

public static class DemandWeights
{
    public static readonly IReadOnlyDictionary<MarketType, SignalWeights> ByMarketType =
        new Dictionary<MarketType, SignalWeights>
        {
            [MarketType.Mountains]    = new(Holiday: 15, LongWeekend: 25, Bridge: 20, HolidayEve: 8, WinterBreak: 25),
            [MarketType.Seaside]      = new(Holiday: 10, LongWeekend: 20, Bridge: 15, HolidayEve: 5, WinterBreak: 5),
            [MarketType.CityTourist]  = new(Holiday: 12, LongWeekend: 18, Bridge: 12, HolidayEve: 6, WinterBreak: 8),
            [MarketType.CityBusiness] = new(Holiday: -8, LongWeekend: -10, Bridge: -5, HolidayEve: 0, WinterBreak: 0),
        };
}
```

`DemandScoreCalculator.cs`:
```csharp
namespace Rezio.Demand.Domain;

public sealed record DemandScore(DateOnly Date, int Score, IReadOnlyList<string> Drivers);

public static class DemandScoreCalculator
{
    public const int Baseline = 50;

    public static DemandScore Score(MarketType marketType, Voivodeship voivodeship, DaySignals signals)
    {
        var weights = DemandWeights.ByMarketType[marketType];

        // Sygnały kalendarzowe nie sumują się: priorytet długi weekend > mostek > święto > przeddzień
        var calendar = signals switch
        {
            { InLongWeekend: true } => weights.LongWeekend,
            { IsBridge: true } => weights.Bridge,
            { IsHoliday: true } => weights.Holiday,
            { IsHolidayEve: true } => weights.HolidayEve,
            _ => 0
        };

        var winterBreak = WinterBreakCalendar.Covers(voivodeship, signals.Date);
        var score = Math.Clamp(Baseline + calendar + (winterBreak ? weights.WinterBreak : 0), 0, 100);

        var drivers = new List<string>();
        if (signals.HolidayName is not null) drivers.Add(signals.HolidayName);
        if (signals.InLongWeekend) drivers.Add("długi weekend");
        if (signals.IsBridge) drivers.Add("mostek");
        if (signals.IsHolidayEve) drivers.Add("przeddzień święta");
        if (winterBreak) drivers.Add($"ferie zimowe ({VoivodeshipNames.Polish(voivodeship)})");

        return new DemandScore(signals.Date, score, drivers);
    }
}
```

- [ ] **Step 4: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: demand score calculator with per-market-type signal weights"
```

---

### Task 6: Endpoint `GET /v1/markets/{id}/demand` + rejestr rynków + health + Serilog

**Files:**
- Create: `services/demand/src/Rezio.Demand.Api/MarketRegistry.cs`
- Create: `services/demand/src/Rezio.Demand.Api/Contracts.cs`
- Modify: `services/demand/src/Rezio.Demand.Api/Program.cs` (całość poniżej)
- Test: `services/demand/tests/Rezio.Demand.Api.Tests/DemandEndpointTests.cs`
- Delete: `services/demand/tests/Rezio.Demand.Api.Tests/UnitTest1.cs`

**Interfaces:**
- Consumes: `CalendarSignals.ForRange`, `DemandScoreCalculator.Score`, `MarketType`, `Voivodeship` (Taski 3–5)
- Produces: HTTP API — `200 DemandResponse(string MarketId, IReadOnlyList<DemandScore> Scores)` snake_case; `404`/`400` problem+json; `GET /health`; rejestr: `mkt_zakopane` (Mountains, małopolskie), `mkt_gdansk` (Seaside, pomorskie), `mkt_krakow` (CityTourist, małopolskie), `mkt_warszawa` (CityBusiness, mazowieckie)

- [ ] **Step 1: Dodaj pakiety (te same co w pricing)**

```bash
dotnet add services/demand/src/Rezio.Demand.Api package Serilog.AspNetCore
dotnet add services/demand/src/Rezio.Demand.Api package Serilog.Sinks.Grafana.Loki
dotnet add services/demand/src/Rezio.Demand.Api package AspNetCore.HealthChecks.UI.Client
```

- [ ] **Step 2: Failing testy integracyjne**

```csharp
using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Demand.Api.Tests;

public class DemandEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Zakopane_boze_cialo_returns_75_with_drivers()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/demand?from=2026-06-04&to=2026-06-07");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("mkt_zakopane", (string)json["market_id"]!);
        var scores = json["scores"]!.AsArray();
        Assert.Equal(4, scores.Count);
        Assert.Equal("2026-06-04", (string)scores[0]!["date"]!);
        Assert.Equal(75, (int)scores[0]!["score"]!);
        Assert.Contains("Boże Ciało", scores[0]!["drivers"]!.AsArray().Select(n => (string)n!));
    }

    [Fact]
    public async Task Unknown_market_returns_404_problem_json()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_nope/demand?from=2026-06-04&to=2026-06-07");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Inverted_range_returns_400_problem_json()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/demand?from=2026-06-07&to=2026-06-04");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
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

Run: `dotnet test services/demand/tests/Rezio.Demand.Api.Tests`
Expected: FAIL

- [ ] **Step 4: Implementacja**

`MarketRegistry.cs`:
```csharp
using Rezio.Demand.Domain;

namespace Rezio.Demand.Api;

public sealed record Market(string Id, string Name, MarketType Type, Voivodeship Voivodeship);

public interface IMarketRegistry
{
    Market? Find(string marketId);
}

public sealed class InMemoryMarketRegistry : IMarketRegistry
{
    private static readonly Dictionary<string, Market> Markets = new[]
    {
        new Market("mkt_zakopane", "Zakopane", MarketType.Mountains, Voivodeship.Malopolskie),
        new Market("mkt_gdansk", "Gdańsk", MarketType.Seaside, Voivodeship.Pomorskie),
        new Market("mkt_krakow", "Kraków", MarketType.CityTourist, Voivodeship.Malopolskie),
        new Market("mkt_warszawa", "Warszawa", MarketType.CityBusiness, Voivodeship.Mazowieckie),
    }.ToDictionary(m => m.Id);

    public Market? Find(string marketId) => Markets.GetValueOrDefault(marketId);
}
```

`Contracts.cs`:
```csharp
using Rezio.Demand.Domain;

namespace Rezio.Demand.Api;

public sealed record DemandResponse(string MarketId, IReadOnlyList<DemandScore> Scores);
```

`Program.cs` (całość):
```csharp
using System.Text.Json;
using HealthChecks.UI.Client;
using Rezio.Demand.Api;
using Rezio.Demand.Domain;
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
            labels: [new LokiLabel { Key = "service", Value = "demand-api" }]);
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton<IMarketRegistry, InMemoryMarketRegistry>();

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

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

app.Run();

public partial class Program;
```

- [ ] **Step 5: Testy zielone (cała solucja)**

Run: `dotnet test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: demand endpoint with market registry, health and structured logging"
```

---

### Task 7: Dockerfile, compose (demand na :8081), README

**Files:**
- Create: `services/demand/Dockerfile`
- Modify: `docker-compose.yml` (dodanie serwisu `demand-api` + wpis w HealthChecks UI)
- Modify: `README.md` (wiersz w tabeli usług)

**Interfaces:**
- Consumes: publikowalny `Rezio.Demand.Api` (Task 6), istniejący compose z planu 1
- Produces: `docker compose up` podnosi też demand-api na hoście `:8081` (kontener `:8080`); HealthChecks UI monitoruje oba serwisy

- [ ] **Step 1: `services/demand/Dockerfile`**

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish services/demand/src/Rezio.Demand.Api -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Rezio.Demand.Api.dll"]
```

- [ ] **Step 2: Rozszerz `docker-compose.yml`**

Dodaj serwis (obok istniejącego `pricing-api`):

```yaml
  demand-api:
    build:
      context: .
      dockerfile: services/demand/Dockerfile
    ports:
      - "8081:8080"
    environment:
      LOKI_URL: http://loki:3100
    depends_on:
      - loki
```

Oraz w `healthchecks-ui.environment` dopisz drugi monitorowany serwis:

```yaml
      HealthChecksUI__HealthChecks__1__Name: demand-api
      HealthChecksUI__HealthChecks__1__Uri: http://demand-api:8080/health
```

- [ ] **Step 3: Zaktualizuj `README.md`**

W tabeli usług dodaj wiersz:

```markdown
| Demand API | http://localhost:8081 (przykład: `/v1/markets/mkt_zakopane/demand?from=2026-06-04&to=2026-06-07`) |
```

- [ ] **Step 4: Odpal cały system i zweryfikuj**

Run: `docker compose up --build -d`, potem:
- `curl "http://localhost:8081/v1/markets/mkt_zakopane/demand?from=2026-06-04&to=2026-06-07"` → 200, score 75 dla 2026-06-04, drivers z „Boże Ciało"
- `curl http://localhost:8081/health` → `{"status":"Healthy",…}`
- `curl "http://localhost:8080/v1/listings/lst_demo/prices?from=2026-08-14&to=2026-08-16"` → pricing dalej działa
- HealthChecks UI pokazuje OBA serwisy jako Healthy (uwaga: na tej maszynie port 8090 przechwytuje lokalny nginx — weryfikacja przez API kontenera jak w planie 1)
- Grafana/Loki: zapytanie `{service="demand-api"}` zwraca logi requestów

Na koniec: `docker compose down`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add demand-api to compose stack and README"
```

---

## Poza zakresem tego planu (kolejne plany)

- Integracja pricing↔demand (RabbitMQ, zdarzenie `demand.score.updated`) — pricing nadal używa demandu z in-memory snapshotu
- Święta zagraniczne DE/CZ/SK (sygnał dla wybrzeża/gór), eventy (PredictHQ/eBilet), pogoda — kolejne iteracje demand-service
- Wakacje letnie jako sygnał — celowo pominięte (sezonowość pokrywa SeasonFactor w pricing; unikamy podwójnego liczenia)
- Persystencja rynków (Postgres) i comp sets — plan scrapera
- Odświeżenie harmonogramu ferii na 2027 (MEN publikuje ~czerwiec 2026) — task operacyjny
