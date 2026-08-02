namespace Rezio.Scraper.Domain;

public static class MarketAggregator
{
    public static IReadOnlyList<MarketDailyStats> Aggregate(IEnumerable<ListingDayObservation> observations) =>
        observations
            .GroupBy(o => o.Date)
            .OrderBy(g => g.Key)
            .Select(g =>
            {
                var active = g.Count();
                var occupied = g.Count(o => !o.Available);
                var availablePrices = g.Where(o => o.Available).Select(o => o.Price).ToList();
                var prices = availablePrices.Count > 0
                    ? availablePrices
                    : g.Select(o => o.Price).ToList();

                return new MarketDailyStats(
                    g.Key,
                    Median(prices),
                    (double)occupied / active,
                    active);
            })
            .ToList();

    private static decimal Median(List<decimal> values)
    {
        values.Sort();
        var mid = values.Count / 2;
        return values.Count % 2 == 1
            ? values[mid]
            : (values[mid - 1] + values[mid]) / 2m;
    }
}
