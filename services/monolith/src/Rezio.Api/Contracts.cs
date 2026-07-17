using Rezio.Pricing.Domain;

namespace Rezio.Api;

public sealed record PricesResponse(
    string ListingId,
    string Currency,
    IReadOnlyList<PriceRecommendation> Prices);

public sealed record PublishPricesRequest(string ConnectionId, string ExternalListingId, DateOnly From, DateOnly To);
public sealed record PublishPricesResponse(int PublishedDays);
