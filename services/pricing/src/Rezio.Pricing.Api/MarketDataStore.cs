using System.Collections.Concurrent;

namespace Rezio.Pricing.Api;

public sealed class InMemoryMarketDataStore : IMarketDataStore
{
    private static readonly IReadOnlyList<string> NoDrivers = [];
    private readonly ConcurrentDictionary<(string MarketId, DateOnly Date), MarketDayData> _data = new();

    public Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct)
    {
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(occupancyRate, null, NoDrivers),
            (_, existing) => existing with { OccupancyRate = occupancyRate });
        return Task.CompletedTask;
    }

    public Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct)
    {
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(null, score, drivers),
            (_, existing) => existing with { DemandScore = score, DemandDrivers = drivers });
        return Task.CompletedTask;
    }

    public Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct) =>
        Task.FromResult(_data.GetValueOrDefault((marketId, date)) ?? new MarketDayData(null, null, NoDrivers));
}
