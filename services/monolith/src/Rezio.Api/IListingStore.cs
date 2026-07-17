using Rezio.Pricing.Domain;

namespace Rezio.Api;

public interface IListingStore
{
    ListingSettings? FindSettings(string listingId);
    Task<IReadOnlyList<MarketDaySnapshot>> MarketDaysAsync(string listingId, DateOnly from, DateOnly to, CancellationToken ct);
}
