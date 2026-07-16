using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public sealed class InMemoryListingStore : IListingStore
{
    private static readonly ListingSettings Demo = new(350m, 200m, 800m, MarketType.Seaside);

    public ListingSettings? FindSettings(string listingId) =>
        listingId == "lst_demo" ? Demo : null;

    public IReadOnlyList<MarketDaySnapshot> MarketDays(string listingId, DateOnly from, DateOnly to)
    {
        var days = new List<MarketDaySnapshot>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var weekend = d.DayOfWeek is DayOfWeek.Friday or DayOfWeek.Saturday;
            days.Add(new MarketDaySnapshot(d, 0.70, weekend ? 60 : 50, weekend ? ["weekend"] : []));
        }
        return days;
    }
}
