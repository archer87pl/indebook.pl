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
