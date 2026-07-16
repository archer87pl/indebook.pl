using Rezio.Pricing.Domain.Factors;

namespace Rezio.Pricing.Domain;

public static class PricingEngine
{
    public static PriceRecommendation Recommend(
        ListingSettings settings, MarketDaySnapshot day, DateOnly today)
    {
        var season = SeasonFactor.For(settings.MarketType, day.Date);
        var dayOfWeek = DayOfWeekFactor.For(day.Date);
        var leadTime = LeadTimeFactor.For(day.Date.DayNumber - today.DayNumber);
        var occupancy = OccupancyFactor.For(day.OccupancyRate);
        var demand = DemandFactor.For(day.DemandScore);

        var multiplier = season * dayOfWeek * leadTime * occupancy * demand;
        var price = Math.Round(settings.BasePrice * (decimal)multiplier, 0, MidpointRounding.AwayFromZero);

        string? clampedBy = null;
        if (price < settings.MinPrice) { price = settings.MinPrice; clampedBy = "min_price"; }
        else if (price > settings.MaxPrice) { price = settings.MaxPrice; clampedBy = "max_price"; }

        return new PriceRecommendation(
            day.Date,
            price,
            new PriceComponents(settings.BasePrice, season, dayOfWeek, leadTime, occupancy, demand, day.DemandDrivers),
            clampedBy);
    }
}
