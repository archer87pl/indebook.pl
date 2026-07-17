using MassTransit;
using Rezio.Contracts;

namespace Rezio.Pricing.Api;

public sealed class MarketStatsUpdatedConsumer(IMarketDataStore store, ILogger<MarketStatsUpdatedConsumer> logger)
    : IConsumer<MarketStatsUpdated>
{
    public async Task Consume(ConsumeContext<MarketStatsUpdated> context)
    {
        var msg = context.Message;
        foreach (var line in msg.Stats)
            await store.SetStatsAsync(msg.MarketId, line.Date, line.OccupancyRate, context.CancellationToken);
        logger.LogInformation("Market stats for {MarketId}: {Days} day(s) updated", msg.MarketId, msg.Stats.Count);
    }
}

public sealed class DemandScoreUpdatedConsumer(IMarketDataStore store, ILogger<DemandScoreUpdatedConsumer> logger)
    : IConsumer<DemandScoreUpdated>
{
    public async Task Consume(ConsumeContext<DemandScoreUpdated> context)
    {
        var msg = context.Message;
        foreach (var line in msg.Scores)
            await store.SetDemandAsync(msg.MarketId, line.Date, line.Score, line.Drivers, context.CancellationToken);
        logger.LogInformation("Demand scores for {MarketId}: {Days} day(s) updated", msg.MarketId, msg.Scores.Count);
    }
}
