using Microsoft.Extensions.Time.Testing;

namespace Rezio.Pricing.Api.Tests;

public class MarketDataFreshnessTests
{
    private static readonly DateOnly D = new(2026, 6, 4);

    [Fact]
    public async Task Fresh_data_within_seven_days_is_returned()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        var store = new InMemoryMarketDataStore(clock);
        await store.SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);

        clock.Advance(TimeSpan.FromDays(6));
        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(0.9, data.OccupancyRate);
    }

    [Fact]
    public async Task Stale_data_older_than_seven_days_degrades_to_null_object()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        var store = new InMemoryMarketDataStore(clock);
        await store.SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);
        await store.SetDemandAsync("mkt_gdansk", D, 75, ["Boże Ciało"], CancellationToken.None);

        clock.Advance(TimeSpan.FromDays(8));
        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Null(data.OccupancyRate);
        Assert.Null(data.DemandScore);
        Assert.Empty(data.DemandDrivers);
    }

    [Fact]
    public async Task Listing_store_uses_fallback_when_data_is_stale()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 9, 12, 0, 0, TimeSpan.Zero));
        var store = new InMemoryMarketDataStore(clock);
        var listings = new InMemoryListingStore(store);
        await store.SetStatsAsync("mkt_gdansk", new DateOnly(2026, 6, 9), 0.95, CancellationToken.None);

        clock.Advance(TimeSpan.FromDays(10));
        var day = (await listings.MarketDaysAsync("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9), CancellationToken.None)).Single();
        Assert.Equal(0.70, day.OccupancyRate); // fallback, bo dane nieświeże
    }
}
