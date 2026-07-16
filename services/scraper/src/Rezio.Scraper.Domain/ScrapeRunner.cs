namespace Rezio.Scraper.Domain;

public sealed record ScrapeResult(string MarketId, int ListingsScraped, int DaysAggregated);

public sealed class ScrapeRunner(IListingSource source, IStatsStore store)
{
    public async Task<ScrapeResult> RunAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var listings = await source.GetListingsAsync(marketId, ct);
        if (listings.Count == 0)
            return new ScrapeResult(marketId, 0, 0);

        // Klasyfikacja per oferta — wynik będzie persystowany per kategoria/tag
        // w planie Postgresa (comp sets); tu napędza przyszłe agregaty segmentowe.
        _ = listings.Select(ListingClassifier.Classify).ToList();

        var observations = new List<ListingDayObservation>();
        foreach (var listing in listings)
        {
            ct.ThrowIfCancellationRequested();
            observations.AddRange(await source.GetCalendarAsync(listing, from, to, ct));
        }

        var stats = MarketAggregator.Aggregate(observations);
        store.Save(marketId, stats);
        return new ScrapeResult(marketId, listings.Count, stats.Count);
    }
}
