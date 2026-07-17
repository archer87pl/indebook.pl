using Rezio.Demand.Domain;
using Rezio.Pricing.Domain;

namespace Rezio.Api;

public sealed class InMemoryListingStore(IMarketDataStore marketData, IMarketRegistry demandRegistry) : IListingStore
{
    private const string DemoMarketId = "mkt_gdansk";
    private static readonly ListingSettings Demo = new(350m, 200m, 800m, Rezio.Pricing.Domain.MarketType.Seaside);

    public ListingSettings? FindSettings(string listingId) =>
        listingId == "lst_demo" ? Demo : null;

    public async Task<IReadOnlyList<MarketDaySnapshot>> MarketDaysAsync(
        string listingId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var demandMarket = demandRegistry.Find(DemoMarketId)!; // mkt_gdansk → Seaside/Pomorskie
        var days = new List<MarketDaySnapshot>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var occupancy = (await marketData.GetAsync(DemoMarketId, d, ct)).OccupancyRate ?? 0.70;
            var signals = CalendarSignals.ForRange(d, d).Single();
            var demand = DemandScoreCalculator.Score(demandMarket.Type, demandMarket.Voivodeship, signals);
            days.Add(new MarketDaySnapshot(d, occupancy, demand.Score, demand.Drivers));
        }
        return days;
    }
}
