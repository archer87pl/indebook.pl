namespace Rezio.ChannelSync.Domain;

public sealed record ChannelListing(string ExternalId, string Title, string MarketId);

public sealed record Reservation(
    string ExternalListingId,
    DateOnly CheckIn,
    DateOnly CheckOut,
    decimal TotalPrice);

public sealed record RateUpdate(DateOnly Date, decimal Price);
