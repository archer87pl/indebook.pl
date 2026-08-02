using System.Collections.Concurrent;

namespace Rezio.Scraper.Domain;

public sealed class InMemoryStatsStore : IStatsStore
{
    private readonly ConcurrentDictionary<(string MarketId, DateOnly Date), MarketDailyStats> _stats = new();

    public void Save(string marketId, IReadOnlyList<MarketDailyStats> stats)
    {
        foreach (var s in stats)
            _stats[(marketId, s.Date)] = s;
    }

    public IReadOnlyList<MarketDailyStats> Get(string marketId, DateOnly from, DateOnly to) =>
        _stats
            .Where(kv => kv.Key.MarketId == marketId && kv.Key.Date >= from && kv.Key.Date <= to)
            .Select(kv => kv.Value)
            .OrderBy(s => s.Date)
            .ToList();
}
