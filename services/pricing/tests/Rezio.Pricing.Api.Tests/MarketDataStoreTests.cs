namespace Rezio.Pricing.Api.Tests;

public class MarketDataStoreTests
{
    private static readonly DateOnly D = new(2026, 6, 4);

    [Fact]
    public void Empty_store_returns_nulls_and_empty_drivers()
    {
        var store = new Rezio.Pricing.Api.MarketDataStore();
        var data = store.Get("mkt_gdansk", D);
        Assert.Null(data.OccupancyRate);
        Assert.Null(data.DemandScore);
        Assert.Empty(data.DemandDrivers);
    }

    [Fact]
    public void Stats_and_demand_merge_per_key()
    {
        var store = new Rezio.Pricing.Api.MarketDataStore();
        store.SetStats("mkt_gdansk", D, 0.85);
        store.SetDemand("mkt_gdansk", D, 70, ["Boże Ciało"]);

        var data = store.Get("mkt_gdansk", D);
        Assert.Equal(0.85, data.OccupancyRate);
        Assert.Equal(70, data.DemandScore);
        Assert.Equal(["Boże Ciało"], data.DemandDrivers);
    }

    [Fact]
    public void Set_demand_then_stats_preserves_demand()
    {
        var store = new Rezio.Pricing.Api.MarketDataStore();
        store.SetDemand("mkt_gdansk", D, 70, ["Boże Ciało"]);
        store.SetStats("mkt_gdansk", D, 0.85);

        var data = store.Get("mkt_gdansk", D);
        Assert.Equal(70, data.DemandScore);
        Assert.Equal(0.85, data.OccupancyRate);
    }

    [Fact]
    public void Listing_store_falls_back_without_event_data_and_uses_it_when_present()
    {
        var marketData = new Rezio.Pricing.Api.MarketDataStore();
        var listings = new Rezio.Pricing.Api.InMemoryListingStore(marketData);

        // bez danych: fallback — wtorek 2026-06-09 => 0.70 / 50 / []
        var before = listings.MarketDays("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9)).Single();
        Assert.Equal(0.70, before.OccupancyRate);
        Assert.Equal(50, before.DemandScore);
        Assert.Empty(before.DemandDrivers);

        // z danymi z eventów
        marketData.SetStats("mkt_gdansk", new DateOnly(2026, 6, 9), 0.9);
        marketData.SetDemand("mkt_gdansk", new DateOnly(2026, 6, 9), 75, ["ferie zimowe (pomorskie)"]);
        var after = listings.MarketDays("lst_demo", new DateOnly(2026, 6, 9), new DateOnly(2026, 6, 9)).Single();
        Assert.Equal(0.9, after.OccupancyRate);
        Assert.Equal(75, after.DemandScore);
        Assert.Equal(["ferie zimowe (pomorskie)"], after.DemandDrivers);
    }

    [Fact]
    public void Weekend_fallback_is_preserved_without_event_data()
    {
        var listings = new Rezio.Pricing.Api.InMemoryListingStore(new Rezio.Pricing.Api.MarketDataStore());
        var friday = listings.MarketDays("lst_demo", new DateOnly(2026, 6, 5), new DateOnly(2026, 6, 5)).Single();
        Assert.Equal(60, friday.DemandScore);
        Assert.Equal(["weekend"], friday.DemandDrivers);
    }
}
