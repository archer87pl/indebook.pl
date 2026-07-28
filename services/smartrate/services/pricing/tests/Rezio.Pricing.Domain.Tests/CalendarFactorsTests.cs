using Rezio.Pricing.Domain;
using Rezio.Pricing.Domain.Factors;

namespace Rezio.Pricing.Domain.Tests;

public class CalendarFactorsTests
{
    [Theory]
    [InlineData("2026-08-14", 1.15)] // piątek
    [InlineData("2026-08-15", 1.15)] // sobota
    [InlineData("2026-08-16", 1.00)] // niedziela
    [InlineData("2026-08-17", 1.00)] // poniedziałek
    public void DayOfWeek_uplift_for_friday_and_saturday(string date, double expected) =>
        Assert.Equal(expected, DayOfWeekFactor.For(DateOnly.Parse(date)));

    [Theory]
    [InlineData(MarketType.Seaside,      "2026-08-01", 1.35)]
    [InlineData(MarketType.Seaside,      "2026-11-01", 0.75)]
    [InlineData(MarketType.Mountains,    "2026-01-15", 1.25)]
    [InlineData(MarketType.Mountains,    "2026-11-15", 0.85)]
    [InlineData(MarketType.CityBusiness, "2026-07-15", 0.90)]
    [InlineData(MarketType.CityTourist,  "2026-07-15", 1.15)]
    public void Season_curve_per_market_type(MarketType type, string date, double expected) =>
        Assert.Equal(expected, SeasonFactor.For(type, DateOnly.Parse(date)));

    [Theory]
    [InlineData(-1, 1.00)]  // data przeszła — neutralnie
    [InlineData(0, 0.90)]
    [InlineData(3, 0.90)]
    [InlineData(4, 0.95)]
    [InlineData(7, 0.95)]
    [InlineData(30, 1.00)]
    [InlineData(90, 1.00)]
    [InlineData(91, 1.05)]
    public void LeadTime_bands(int daysAhead, double expected) =>
        Assert.Equal(expected, LeadTimeFactor.For(daysAhead));
}
