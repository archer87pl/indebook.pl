using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public interface IListingStore
{
    ListingSettings? FindSettings(string listingId);
    IReadOnlyList<MarketDaySnapshot> MarketDays(string listingId, DateOnly from, DateOnly to);
}
