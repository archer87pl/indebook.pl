using Rezio.ChannelSync.Domain;
using Rezio.Pricing.Domain;

namespace Rezio.Api;

public sealed class PricePusher(
    IListingStore store, ConnectionRegistry registry,
    IAdapterFactory factory, RatePushService push, ILogger<PricePusher> logger)
{
    public async Task<int> PushAsync(
        string listingId, string connectionId, string externalListingId,
        DateOnly from, DateOnly to, DateOnly today, CancellationToken ct)
    {
        var settings = store.FindSettings(listingId);
        if (settings is null) return 0;

        var connection = registry.Find(connectionId);
        if (connection is null) return 0;

        var recs = await store.MarketDaysAsync(listingId, from, to, ct);
        var rates = recs
            .Select(day => PricingEngine.Recommend(settings, day, today))
            .Select(rec => new RateUpdate(rec.Date, rec.RecommendedPrice))
            .ToList();

        var adapter = factory.For(connection.Provider);
        var outcome = await push.PushAsync(adapter, externalListingId, rates, from, to, maxAttempts: 3, ct);
        if (outcome is PushOutcome.Failed f)
            logger.LogError("Rate push to {Ext} failed after {N}: {Err}", externalListingId, f.AttemptsUsed, f.LastError);
        else
            logger.LogInformation("Pushed {N} rates to {Ext}", rates.Count, externalListingId);
        return rates.Count;
    }
}
