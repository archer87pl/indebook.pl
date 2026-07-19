using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class ScrapeRunnerTests
{
    [Fact]
    public async Task Run_populates_store_with_aggregated_stats()
    {
        var store = new InMemoryStatsStore();
        var runner = new ScrapeRunner(new SyntheticListingSource(), store);
        var from = DateOnly.Parse("2026-08-01");
        var to = DateOnly.Parse("2026-08-07");

        var result = await runner.RunAsync("mkt_zakopane", from, to, CancellationToken.None);

        Assert.Equal(30, result.ListingsScraped);
        Assert.Equal(7, result.DaysAggregated);

        var stats = store.Get("mkt_zakopane", from, to);
        Assert.Equal(7, stats.Count);
        Assert.All(stats, s => Assert.Equal(30, s.ActiveListings));
        Assert.All(stats, s => Assert.InRange(s.OccupancyRate, 0.0, 1.0));
        Assert.All(stats, s => Assert.True(s.MedianPrice > 0));
    }

    [Fact]
    public async Task Run_for_empty_market_scrapes_nothing()
    {
        var store = new InMemoryStatsStore();
        var runner = new ScrapeRunner(new SyntheticListingSource(), store);

        var result = await runner.RunAsync("", DateOnly.Parse("2026-08-01"), DateOnly.Parse("2026-08-07"), CancellationToken.None);

        Assert.Equal(0, result.ListingsScraped);
        Assert.Equal(0, result.DaysAggregated);
        Assert.Empty(store.Get("", DateOnly.Parse("2026-08-01"), DateOnly.Parse("2026-08-07")));
    }

    [Fact]
    public async Task Second_run_upserts_same_dates_without_duplicates()
    {
        var store = new InMemoryStatsStore();
        var runner = new ScrapeRunner(new SyntheticListingSource(), store);
        var from = DateOnly.Parse("2026-08-01");
        var to = DateOnly.Parse("2026-08-03");

        await runner.RunAsync("mkt_gdansk", from, to, CancellationToken.None);
        await runner.RunAsync("mkt_gdansk", from, to, CancellationToken.None);

        Assert.Equal(3, store.Get("mkt_gdansk", from, to).Count);
    }

    [Fact]
    public void Store_get_filters_range_and_sorts()
    {
        var store = new InMemoryStatsStore();
        store.Save("m", [
            new MarketDailyStats(DateOnly.Parse("2026-08-03"), 100m, 0.5, 10),
            new MarketDailyStats(DateOnly.Parse("2026-08-01"), 100m, 0.5, 10),
            new MarketDailyStats(DateOnly.Parse("2026-08-02"), 100m, 0.5, 10),
        ]);

        var got = store.Get("m", DateOnly.Parse("2026-08-01"), DateOnly.Parse("2026-08-02"));
        Assert.Equal(2, got.Count);
        Assert.Equal(DateOnly.Parse("2026-08-01"), got[0].Date);
    }
}
