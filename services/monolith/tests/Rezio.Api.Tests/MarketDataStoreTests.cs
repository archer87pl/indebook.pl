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
    public async Task Listing_store_falls_back_occupancy_but_computes_demand_inline_regardless_of_stored_demand()
    {
        var marketData = new Rezio.Api.InMemoryMarketDataStore(TimeProvider.System);
        var demandRegistry = new Rezio.Demand.Domain.InMemoryMarketRegistry();
        var listings = new Rezio.Api.InMemoryListingStore(marketData, demandRegistry);

        // bez danych obłożenia: fallback 0.70; wtorek 2026-06-09 (bez święta/mostka) => demand inline = 50 / []
        var before = (await listings.MarketDaysAsync("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9), CancellationToken.None)).Single();
        Assert.Equal(0.70, before.OccupancyRate);
        Assert.Equal(50, before.DemandScore);
        Assert.Empty(before.DemandDrivers);

        // obłożenie z ingestu wpływa na wynik; popyt jest zawsze liczony inline i ignoruje SetDemandAsync
        await marketData.SetStatsAsync("mkt_gdansk", new DateOnly(2026, 6, 9), 0.9, CancellationToken.None);
        await marketData.SetDemandAsync("mkt_gdansk", new DateOnly(2026, 6, 9), 75, ["ferie zimowe (pomorskie)"], CancellationToken.None);
        var after = (await listings.MarketDaysAsync("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9), CancellationToken.None)).Single();
        Assert.Equal(0.9, after.OccupancyRate);
        Assert.Equal(50, after.DemandScore);
        Assert.Empty(after.DemandDrivers);
    }

    [Fact]
    public async Task Boze_Cialo_bridge_day_gets_inline_long_weekend_demand()
    {
        var listings = new Rezio.Api.InMemoryListingStore(
            new Rezio.Api.InMemoryMarketDataStore(TimeProvider.System),
            new Rezio.Demand.Domain.InMemoryMarketRegistry());

        // piątek 2026-06-05 to mostek w długim weekendzie Bożego Ciała (czwartek 2026-06-04)
        var friday = (await listings.MarketDaysAsync("lst_demo", new DateOnly(2026, 6, 5), new DateOnly(2026, 6, 5), CancellationToken.None)).Single();
        Assert.True(friday.DemandScore > 50);
        Assert.Contains("długi weekend", friday.DemandDrivers);
    }
}
