using Rezio.Demand.Domain;
using Rezio.Pricing.Domain;

namespace Rezio.Api;

public sealed record QuoteComponents(
    decimal BasePrice, double Season, double DayOfWeek, double LeadTime, double MarketOccupancy, double Demand);

public sealed record QuoteDay(
    DateOnly Date, decimal RecommendedPrice, string? ClampedBy,
    double OccupancyRate, string OccupancySource, int DemandScore,
    QuoteComponents Components, IReadOnlyList<string> DemandDrivers);

public sealed class QuoteService(IMarketRegistry registry, IMarketDataStore marketData)
{
    public async Task<IReadOnlyList<QuoteDay>?> QuoteAsync(
        string marketId, decimal basePrice, decimal minPrice, decimal maxPrice,
        DateOnly from, DateOnly to, DateOnly today, CancellationToken ct)
    {
        var market = registry.Find(marketId);
        if (market is null) return null;

        var pricingType = MapType(market.Type);
        var settings = new ListingSettings(basePrice, minPrice, maxPrice, pricingType);

        var days = new List<QuoteDay>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var data = await marketData.GetAsync(marketId, d, ct);
            var source = data.OccupancyRate is null ? "fallback" : "scraped";
            var occupancy = data.OccupancyRate ?? 0.70;

            var signals = CalendarSignals.ForRange(d, d).Single();
            var demand = DemandScoreCalculator.Score(market.Type, market.Voivodeship, signals);

            var rec = PricingEngine.Recommend(settings, new MarketDaySnapshot(d, occupancy, demand.Score, demand.Drivers), today);
            var c = rec.Components;
            days.Add(new QuoteDay(
                d, rec.RecommendedPrice, rec.ClampedBy, occupancy, source, demand.Score,
                new QuoteComponents(c.BasePrice, c.Season, c.DayOfWeek, c.LeadTime, c.MarketOccupancy, c.Demand),
                rec.Components.DemandDrivers));
        }
        return days;
    }

    private static Rezio.Pricing.Domain.MarketType MapType(Rezio.Demand.Domain.MarketType t) => t switch
    {
        Rezio.Demand.Domain.MarketType.Mountains => Rezio.Pricing.Domain.MarketType.Mountains,
        Rezio.Demand.Domain.MarketType.Seaside => Rezio.Pricing.Domain.MarketType.Seaside,
        Rezio.Demand.Domain.MarketType.CityBusiness => Rezio.Pricing.Domain.MarketType.CityBusiness,
        Rezio.Demand.Domain.MarketType.CityTourist => Rezio.Pricing.Domain.MarketType.CityTourist,
        _ => Rezio.Pricing.Domain.MarketType.CityTourist,
    };
}
