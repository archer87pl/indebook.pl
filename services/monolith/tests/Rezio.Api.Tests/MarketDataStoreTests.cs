namespace Rezio.Api.Tests;

public class MarketDataStoreTests
{
    private static readonly DateOnly D = new(2026, 6, 4);

    [Fact]
    public async Task Empty_store_returns_nulls_and_empty_drivers()
    {
        var store = new Rezio.Api.InMemoryMarketDataStore(TimeProvider.System);
        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Null(data.OccupancyRate);
        Assert.Null(data.DemandScore);
        Assert.Empty(data.DemandDrivers);
    }

    [Fact]
    public async Task Stats_and_demand_merge_per_key()
    {
        var store = new Rezio.Api.InMemoryMarketDataStore(TimeProvider.System);
        await store.SetStatsAsync("mkt_gdansk", D, 0.85, CancellationToken.None);
        await store.SetDemandAsync("mkt_gdansk", D, 70, ["Boże Ciało"], CancellationToken.None);

        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(0.85, data.OccupancyRate);
        Assert.Equal(70, data.DemandScore);
        Assert.Equal(["Boże Ciało"], data.DemandDrivers);
    }

    [Fact]
    public async Task Set_demand_then_stats_preserves_demand()
    {
        var store = new Rezio.Api.InMemoryMarketDataStore(TimeProvider.System);
        await store.SetDemandAsync("mkt_gdansk", D, 70, ["Boże Ciało"], CancellationToken.None);
        await store.SetStatsAsync("mkt_gdansk", D, 0.85, CancellationToken.None);

        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(70, data.DemandScore);
        Assert.Equal(0.85, data.OccupancyRate);
    }

    [Fact]
    public async Task Listing_store_falls_back_without_event_data_and_uses_it_when_present()
    {
        var marketData = new Rezio.Api.InMemoryMarketDataStore(TimeProvider.System);
        var listings = new Rezio.Api.InMemoryListingStore(marketData);

        // bez danych: fallback — wtorek 2026-06-09 => 0.70 / 50 / []
        var before = (await listings.MarketDaysAsync("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9), CancellationToken.None)).Single();
        Assert.Equal(0.70, before.OccupancyRate);
        Assert.Equal(50, before.DemandScore);
        Assert.Empty(before.DemandDrivers);

        // z danymi z eventów
        await marketData.SetStatsAsync("mkt_gdansk", new DateOnly(2026, 6, 9), 0.9, CancellationToken.None);
        await marketData.SetDemandAsync("mkt_gdansk", new DateOnly(2026, 6, 9), 75, ["ferie zimowe (pomorskie)"], CancellationToken.None);
        var after = (await listings.MarketDaysAsync("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9), CancellationToken.None)).Single();
        Assert.Equal(0.9, after.OccupancyRate);
        Assert.Equal(75, after.DemandScore);
        Assert.Equal(["ferie zimowe (pomorskie)"], after.DemandDrivers);
    }

    [Fact]
    public async Task Weekend_fallback_is_preserved_without_event_data()
    {
        var listings = new Rezio.Api.InMemoryListingStore(new Rezio.Api.InMemoryMarketDataStore(TimeProvider.System));
        var friday = (await listings.MarketDaysAsync("lst_demo", new DateOnly(2026, 6, 5), new DateOnly(2026, 6, 5), CancellationToken.None)).Single();
        Assert.Equal(60, friday.DemandScore);
        Assert.Equal(["weekend"], friday.DemandDrivers);
    }
}
