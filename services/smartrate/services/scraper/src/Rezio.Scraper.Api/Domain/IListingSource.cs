namespace Rezio.Scraper.Domain;

public interface IListingSource
{
    Task<IReadOnlyList<RawListing>> GetListingsAsync(string marketId, CancellationToken ct);
    Task<IReadOnlyList<ListingDayObservation>> GetCalendarAsync(RawListing listing, DateOnly from, DateOnly to, CancellationToken ct);
}
