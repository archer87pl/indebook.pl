namespace Rezio.Contracts;

public sealed record RateLine(DateOnly Date, decimal Price);

public sealed record PriceComputed(
    string ListingId,
    string ConnectionId,
    string ExternalListingId,
    string Currency,
    DateOnly From,
    DateOnly To,
    IReadOnlyList<RateLine> Rates);
