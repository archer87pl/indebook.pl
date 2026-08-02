using Rezio.Demand.Domain;

namespace Rezio.Demand.Domain.Tests;

public class EventDemandTests
{
    // zwykły wtorek, bez świąt i ferii — czysta baza 50
    private static readonly DaySignals PlainDay =
        new(new DateOnly(2026, 9, 15), false, null, false, false, false);

    private static DemandScore Score(MarketType type, params EventSignal[] events) =>
        DemandScoreCalculator.Score(type, Voivodeship.Mazowieckie, PlainDay, events);

    [Fact]
    public void Bez_wydarzen_wynik_jest_taki_jak_wczesniej()
    {
        var withoutArgument = DemandScoreCalculator.Score(
            MarketType.CityTourist, Voivodeship.Mazowieckie, PlainDay);
        var withEmptyList = Score(MarketType.CityTourist);

        Assert.Equal(DemandScoreCalculator.Baseline, withoutArgument.Score);
        Assert.Equal(withoutArgument.Score, withEmptyList.Score);
        Assert.Empty(withEmptyList.Drivers);
    }

    [Fact]
    public void Wydarzenie_podbija_popyt_wedlug_skali()
    {
        var small = Score(MarketType.CityTourist, new EventSignal("Klubowy koncert", EventScale.Small));
        var large = Score(MarketType.CityTourist, new EventSignal("Stadionowy koncert", EventScale.Large));

        Assert.Equal(55, small.Score); // baseline 50 + EventSmall 5
        Assert.Equal(70, large.Score); // baseline 50 + EventLarge 20
    }

    [Fact]
    public void Nazwy_wydarzen_trafiaja_do_driverow()
    {
        var score = Score(MarketType.Seaside, new EventSignal("Open'er Festival", EventScale.Large));
        Assert.Contains("Open'er Festival", score.Drivers);
    }

    [Fact]
    public void Wydarzenia_sumuja_sie_ale_nie_przekraczaja_sufitu()
    {
        var many = Enumerable.Range(0, 10)
            .Select(i => new EventSignal($"Koncert {i}", EventScale.Large))
            .ToArray();

        var score = Score(MarketType.CityTourist, many);

        // 10 × EventLarge(20) = 200, ale sufit rynku turystycznego to 25
        Assert.Equal(DemandScoreCalculator.Baseline + 25, score.Score);
    }

    [Fact]
    public void Wydarzenie_dokłada_sie_do_sygnalu_kalendarzowego_a_nie_zastepuje_go()
    {
        // 1 listopada 2026 (niedziela) — Wszystkich Świętych w długim weekendzie
        var holiday = new DaySignals(
            new DateOnly(2026, 11, 1), true, "Wszystkich Świętych", true, false, false);

        var withoutEvent = DemandScoreCalculator.Score(
            MarketType.CityTourist, Voivodeship.Mazowieckie, holiday);
        var withEvent = DemandScoreCalculator.Score(
            MarketType.CityTourist, Voivodeship.Mazowieckie, holiday,
            [new EventSignal("Koncert", EventScale.Medium)]);

        Assert.Equal(withoutEvent.Score + 12, withEvent.Score); // EventMedium dla CityTourist
    }

    [Fact]
    public void Miasto_biznesowe_ratuje_sie_wydarzeniami_z_ujemnego_kalendarza()
    {
        var longWeekend = new DaySignals(
            new DateOnly(2026, 11, 1), true, "Wszystkich Świętych", true, false, false);

        var empty = DemandScoreCalculator.Score(
            MarketType.CityBusiness, Voivodeship.Mazowieckie, longWeekend);
        var withFair = DemandScoreCalculator.Score(
            MarketType.CityBusiness, Voivodeship.Mazowieckie, longWeekend,
            [new EventSignal("Duże targi", EventScale.Large)]);

        Assert.Equal(40, empty.Score); // 50 - 10 za długi weekend
        Assert.Equal(62, withFair.Score); // + EventLarge 22
    }

    [Fact]
    public void Wynik_nigdy_nie_wychodzi_poza_zakres_0_100()
    {
        var many = Enumerable.Range(0, 50)
            .Select(i => new EventSignal($"E{i}", EventScale.Large))
            .ToArray();

        var winter = new DaySignals(new DateOnly(2026, 2, 3), false, null, true, false, false);
        var score = DemandScoreCalculator.Score(
            MarketType.Mountains, Voivodeship.Malopolskie, winter, many);

        Assert.InRange(score.Score, 0, 100);
    }
}
