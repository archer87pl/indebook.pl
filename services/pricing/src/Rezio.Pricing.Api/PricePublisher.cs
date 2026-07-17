using MassTransit;
using Rezio.Contracts;
using Rezio.Pricing.Domain;

namespace Rezio.Pricing.Api;

public sealed class PricePublisher(IListingStore store, IPublishEndpoint bus)
{
    public async Task<int> PublishAsync(
        string listingId, string connectionId, string externalListingId,
        DateOnly from, DateOnly to, DateOnly today, CancellationToken ct)
    {
        var settings = store.FindSettings(listingId);
        if (settings is null)
            return 0;

        var rates = (await store.MarketDaysAsync(listingId, from, to, ct))
            .Select(day => PricingEngine.Recommend(settings, day, today))
            .Select(rec => new RateLine(rec.Date, rec.RecommendedPrice))
            .ToList();

        await bus.Publish(new PriceComputed(
            listingId, connectionId, externalListingId, "PLN", from, to, rates), ct);

        return rates.Count;
    }
}
