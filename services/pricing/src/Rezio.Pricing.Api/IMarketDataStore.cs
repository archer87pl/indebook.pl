namespace Rezio.Pricing.Api;

public sealed record MarketDayData(double? OccupancyRate, int? DemandScore, IReadOnlyList<string> DemandDrivers);

public interface IMarketDataStore
{
    Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct);
    Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct);
    Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct);
}
