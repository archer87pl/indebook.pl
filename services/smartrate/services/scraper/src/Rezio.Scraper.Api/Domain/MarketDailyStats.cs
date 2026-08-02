namespace Rezio.Scraper.Domain;

public sealed record MarketDailyStats(
    DateOnly Date,
    decimal MedianPrice,
    double OccupancyRate,
    int ActiveListings);
