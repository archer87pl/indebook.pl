using MassTransit;
using Rezio.Contracts;
using Rezio.Demand.Domain;

namespace Rezio.Demand.Api;

public sealed class DemandPublisher(IMarketRegistry registry, IPublishEndpoint bus)
{
    public async Task<int> PublishAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var market = registry.Find(marketId);
        if (market is null)
            return 0;

        var scores = CalendarSignals.ForRange(from, to)
            .Select(signals => DemandScoreCalculator.Score(market.Type, market.Voivodeship, signals))
            .Select(score => new DemandScoreLine(score.Date, score.Score, score.Drivers))
            .ToList();

        await bus.Publish(new DemandScoreUpdated(marketId, scores), ct);
        return scores.Count;
    }
}
