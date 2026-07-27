using System.Collections.Concurrent;

namespace Rezio.Api;

public sealed class InMemoryEventStore(TimeProvider clock) : IEventStore
{
    private static readonly IReadOnlyList<MarketEvent> None = [];
    private readonly ConcurrentDictionary<(string MarketId, DateOnly Date),
        (IReadOnlyList<MarketEvent> Events, DateTimeOffset WrittenAt)> _data = new();

    public Task SetEventsAsync(
        string marketId, DateOnly date, IReadOnlyList<MarketEvent> events, CancellationToken ct)
    {
        _data[(marketId, date)] = (events, clock.GetUtcNow());
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<MarketEvent>> GetAsync(string marketId, DateOnly date, CancellationToken ct)
    {
        if (!_data.TryGetValue((marketId, date), out var record))
            return Task.FromResult(None);

        var stale = clock.GetUtcNow() - record.WrittenAt > EventFreshness.Window;
        return Task.FromResult(stale ? None : record.Events);
    }
}
