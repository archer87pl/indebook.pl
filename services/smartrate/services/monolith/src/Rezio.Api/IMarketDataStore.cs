namespace Rezio.Api;

internal static class MarketDataFreshness
{
    public static readonly TimeSpan Window = TimeSpan.FromDays(7);
}

public sealed record MarketDayData(
    double? OccupancyRate,
    int? DemandScore,
    IReadOnlyList<string> DemandDrivers,
    DateTimeOffset? LastWrittenAt = null);

public interface IMarketDataStore
{
    Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct);
    Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct);
    Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct);
}
