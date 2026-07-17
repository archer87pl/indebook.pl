using MassTransit;
using Rezio.Contracts;
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api;

public sealed class ScrapeAndPublish(ScrapeRunner runner, IStatsStore store, IPublishEndpoint bus)
{
    public async Task<ScrapeResult> RunAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var result = await runner.RunAsync(marketId, from, to, ct);
        if (result.DaysAggregated > 0)
        {
            var stats = store.Get(marketId, from, to)
                .Select(s => new MarketStatsLine(s.Date, s.MedianPrice, s.OccupancyRate, s.ActiveListings))
                .ToList();
            await bus.Publish(new MarketStatsUpdated(marketId, stats), ct);
        }
        return result;
    }
}
