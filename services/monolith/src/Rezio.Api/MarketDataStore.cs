using System.Collections.Concurrent;

namespace Rezio.Api;

public sealed class InMemoryMarketDataStore(TimeProvider clock) : IMarketDataStore
{
    private static readonly IReadOnlyList<string> NoDrivers = [];
    private readonly ConcurrentDictionary<(string MarketId, DateOnly Date), MarketDayData> _data = new();

    public Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(occupancyRate, null, NoDrivers, now),
            (_, existing) => existing with { OccupancyRate = occupancyRate, LastWrittenAt = now });
        return Task.CompletedTask;
    }

    public Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(null, score, drivers, now),
            (_, existing) => existing with { DemandScore = score, DemandDrivers = drivers, LastWrittenAt = now });
        return Task.CompletedTask;
    }

    public Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct)
    {
        var empty = new MarketDayData(null, null, NoDrivers);
        if (!_data.TryGetValue((marketId, date), out var record) || record.LastWrittenAt is null)
            return Task.FromResult(empty);

        var stale = clock.GetUtcNow() - record.LastWrittenAt.Value > MarketDataFreshness.Window;
        return Task.FromResult(stale ? empty : record);
    }
}
