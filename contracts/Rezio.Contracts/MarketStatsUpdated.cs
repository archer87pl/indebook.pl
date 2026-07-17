namespace Rezio.Contracts;

public sealed record MarketStatsLine(DateOnly Date, decimal MedianPrice, double OccupancyRate, int ActiveListings);

public sealed record MarketStatsUpdated(string MarketId, IReadOnlyList<MarketStatsLine> Stats);
