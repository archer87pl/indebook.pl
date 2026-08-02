namespace Rezio.Scraper.Domain;

public sealed record ListingDayObservation(
    string ExternalRef,
    DateOnly Date,
    decimal Price,
    bool Available);
