namespace Rezio.Pricing.Domain;

public sealed record ListingSettings(
    decimal BasePrice,
    decimal MinPrice,
    decimal MaxPrice,
    MarketType MarketType);
