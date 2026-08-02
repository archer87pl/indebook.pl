namespace Rezio.Pricing.Domain;

public sealed record MarketDaySnapshot(
    DateOnly Date,
    double OccupancyRate,
    int DemandScore,
    IReadOnlyList<string> DemandDrivers);
