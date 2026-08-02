using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Domain.Tests;

public class PricingEngineTests
{
    // Bałtyk, sobota 15.08, wysoki popyt: 350 × 1.35 × 1.15 × 1.00 × 1.15 × 1.15 = 718.61 → 719
    [Fact]
    public void Seaside_summer_saturday_high_demand()
    {
        var settings = new ListingSettings(350m, 200m, 800m, MarketType.Seaside);
        var day = new MarketDaySnapshot(new DateOnly(2026, 8, 15), 0.90, 80, ["długi weekend 15.08"]);

        var rec = PricingEngine.Recommend(settings, day, today: new DateOnly(2026, 7, 16));

        Assert.Equal(719m, rec.RecommendedPrice);
        Assert.Null(rec.ClampedBy);
        Assert.Equal(1.35, rec.Components.Season);
        Assert.Equal(1.15, rec.Components.DayOfWeek);
        Assert.Equal(1.00, rec.Components.LeadTime);
        Assert.Equal(1.15, rec.Components.MarketOccupancy);
        Assert.Equal(1.15, rec.Components.Demand, precision: 10);
        Assert.Equal(new[] { "długi weekend 15.08" }, rec.Components.DemandDrivers);
    }

    // Góry, poniedziałek w listopadzie, last-minute, martwo: 300 × 0.85 × 1.00 × 0.90 × 0.90 × 0.90 = 185.90 → 186 → clamp do 280
    [Fact]
    public void Low_season_clamps_to_min_price()
    {
        var settings = new ListingSettings(300m, 280m, 900m, MarketType.Mountains);
        var day = new MarketDaySnapshot(new DateOnly(2026, 11, 16), 0.25, 30, []);

        var rec = PricingEngine.Recommend(settings, day, today: new DateOnly(2026, 11, 14));

        Assert.Equal(280m, rec.RecommendedPrice);
        Assert.Equal("min_price", rec.ClampedBy);
    }

    // Miasto turystyczne, szczyt: 700 × 1.15 × 1.15 × 1.00 × 1.15 × 1.25 = 1330.77 → 1331 → clamp do 850
    [Fact]
    public void Peak_demand_clamps_to_max_price()
    {
        var settings = new ListingSettings(700m, 300m, 850m, MarketType.CityTourist);
        var day = new MarketDaySnapshot(new DateOnly(2026, 7, 25), 0.90, 100, ["koncert, Tauron Arena"]); // sobota

        var rec = PricingEngine.Recommend(settings, day, today: new DateOnly(2026, 7, 15));

        Assert.Equal(850m, rec.RecommendedPrice);
        Assert.Equal("max_price", rec.ClampedBy);
    }

    [Fact]
    public void Throws_when_base_price_not_positive()
    {
        var settings = new ListingSettings(0m, 200m, 800m, MarketType.Seaside);
        var day = new MarketDaySnapshot(new DateOnly(2026, 8, 15), 0.90, 80, []);

        Assert.Throws<ArgumentException>(() =>
            PricingEngine.Recommend(settings, day, today: new DateOnly(2026, 7, 16)));
    }

    [Fact]
    public void Throws_when_min_price_exceeds_max_price()
    {
        var settings = new ListingSettings(350m, 500m, 400m, MarketType.Seaside);
        var day = new MarketDaySnapshot(new DateOnly(2026, 8, 15), 0.90, 80, []);

        Assert.Throws<ArgumentException>(() =>
            PricingEngine.Recommend(settings, day, today: new DateOnly(2026, 7, 16)));
    }
}
