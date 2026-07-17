using MassTransit;
using Rezio.Contracts;

namespace Rezio.Pricing.Api;

public sealed class MarketStatsUpdatedConsumer(MarketDataStore store, ILogger<MarketStatsUpdatedConsumer> logger)
    : IConsumer<MarketStatsUpdated>
{
    public Task Consume(ConsumeContext<MarketStatsUpdated> context)
    {
        var msg = context.Message;
        foreach (var line in msg.Stats)
            store.SetStats(msg.MarketId, line.Date, line.OccupancyRate);
        logger.LogInformation("Market stats for {MarketId}: {Days} day(s) updated", msg.MarketId, msg.Stats.Count);
        return Task.CompletedTask;
    }
}

public sealed class DemandScoreUpdatedConsumer(MarketDataStore store, ILogger<DemandScoreUpdatedConsumer> logger)
    : IConsumer<DemandScoreUpdated>
{
    public Task Consume(ConsumeContext<DemandScoreUpdated> context)
    {
        var msg = context.Message;
        foreach (var line in msg.Scores)
            store.SetDemand(msg.MarketId, line.Date, line.Score, line.Drivers);
        logger.LogInformation("Demand scores for {MarketId}: {Days} day(s) updated", msg.MarketId, msg.Scores.Count);
        return Task.CompletedTask;
    }
}
