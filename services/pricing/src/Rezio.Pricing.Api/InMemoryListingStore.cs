using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public sealed class InMemoryListingStore(IMarketDataStore marketData) : IListingStore
{
    private const string DemoMarketId = "mkt_gdansk";
    private static readonly ListingSettings Demo = new(350m, 200m, 800m, MarketType.Seaside);
    private static readonly IReadOnlyList<string> WeekendDrivers = ["weekend"];
    private static readonly IReadOnlyList<string> NoDrivers = [];

    public ListingSettings? FindSettings(string listingId) =>
        listingId == "lst_demo" ? Demo : null;

    public async Task<IReadOnlyList<MarketDaySnapshot>> MarketDaysAsync(
        string listingId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var days = new List<MarketDaySnapshot>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var weekend = d.DayOfWeek is DayOfWeek.Friday or DayOfWeek.Saturday;
            var data = await marketData.GetAsync(DemoMarketId, d, ct);

            var occupancy = data.OccupancyRate ?? 0.70;
            var score = data.DemandScore ?? (weekend ? 60 : 50);
            var drivers = data.DemandScore is null
                ? (weekend ? WeekendDrivers : NoDrivers)
                : data.DemandDrivers;

            days.Add(new MarketDaySnapshot(d, occupancy, score, drivers));
        }
        return days;
    }
}
