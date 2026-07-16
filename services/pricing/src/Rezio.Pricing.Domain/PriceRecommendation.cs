namespace Rezio.Pricing.Domain;

public sealed record PriceComponents(
    decimal BasePrice,
    double Season,
    double DayOfWeek,
    double LeadTime,
    double MarketOccupancy,
    double Demand,
    IReadOnlyList<string> DemandDrivers);

public sealed record PriceRecommendation(
    DateOnly Date,
    decimal RecommendedPrice,
    PriceComponents Components,
    string? ClampedBy);
