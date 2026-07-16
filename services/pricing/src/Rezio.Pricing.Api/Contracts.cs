using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public sealed record PricesResponse(
    string ListingId,
    string Currency,
    IReadOnlyList<PriceRecommendation> Prices);
