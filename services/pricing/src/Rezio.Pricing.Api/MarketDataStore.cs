using System.Collections.Concurrent;

namespace Rezio.Pricing.Api;

public sealed record MarketDayData(double? OccupancyRate, int? DemandScore, IReadOnlyList<string> DemandDrivers);

public sealed class MarketDataStore
{
    private static readonly IReadOnlyList<string> NoDrivers = [];
    private readonly ConcurrentDictionary<(string MarketId, DateOnly Date), MarketDayData> _data = new();

    public void SetStats(string marketId, DateOnly date, double occupancyRate) =>
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(occupancyRate, null, NoDrivers),
            (_, existing) => existing with { OccupancyRate = occupancyRate });

    public void SetDemand(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers) =>
        _data.AddOrUpdate((marketId, date),
            new MarketDayData(null, score, drivers),
            (_, existing) => existing with { DemandScore = score, DemandDrivers = drivers });

    public MarketDayData Get(string marketId, DateOnly date) =>
        _data.GetValueOrDefault((marketId, date)) ?? new MarketDayData(null, null, NoDrivers);
}
