namespace Rezio.Scraper.Domain;

public sealed record RawListing(
    string ExternalRef,
    string Title,
    string PropertyType,
    IReadOnlyList<string> Amenities,
    int Guests,
    int Bedrooms);

public sealed record ClassifiedListing(
    RawListing Raw,
    ListingCategory Category,
    IReadOnlyList<string> Tags);
