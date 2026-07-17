using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;
using Rezio.Pricing.Api.Persistence;

namespace Rezio.Pricing.Api.Tests;

public class EfMarketDataStoreTests : IAsyncLifetime
{
    private SqliteConnection _conn = null!;
    private static readonly DateOnly D = new(2026, 6, 4);

    public async Task InitializeAsync()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        await _conn.OpenAsync();
    }

    public async Task DisposeAsync() => await _conn.DisposeAsync();

    private PricingDbContext NewContext()
    {
        var options = new DbContextOptionsBuilder<PricingDbContext>().UseSqlite(_conn).Options;
        var ctx = new PricingDbContext(options);
        ctx.Database.EnsureCreated();
        return ctx;
    }

    [Fact]
    public async Task Persists_and_reads_back_merged_stats_and_demand()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        await using var ctx = NewContext();
        var store = new EfMarketDataStore(ctx, clock);

        await store.SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);
        await store.SetDemandAsync("mkt_gdansk", D, 75, ["Boże Ciało"], CancellationToken.None);

        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(0.9, data.OccupancyRate);
        Assert.Equal(75, data.DemandScore);
        Assert.Equal(["Boże Ciało"], data.DemandDrivers);
    }

    [Fact]
    public async Task Data_survives_a_new_context_over_same_connection()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        await using (var ctx1 = NewContext())
            await new EfMarketDataStore(ctx1, clock).SetStatsAsync("mkt_gdansk", D, 0.88, CancellationToken.None);

        await using var ctx2 = NewContext();
        var data = await new EfMarketDataStore(ctx2, clock).GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(0.88, data.OccupancyRate); // dane przetrwały (ta sama baza :memory: na wspólnym połączeniu)
    }

    [Fact]
    public async Task Stale_rows_degrade_to_null_object()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        await using var ctx = NewContext();
        var store = new EfMarketDataStore(ctx, clock);
        await store.SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);

        clock.Advance(TimeSpan.FromDays(8));
        var data = await store.GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Null(data.OccupancyRate);
        Assert.Empty(data.DemandDrivers);
    }

    [Fact]
    public async Task Two_store_instances_writing_same_key_merge_without_error()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        await using (var c1 = NewContext())
            await new EfMarketDataStore(c1, clock).SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);
        await using (var c2 = NewContext())
            await new EfMarketDataStore(c2, clock).SetDemandAsync("mkt_gdansk", D, 75, ["Boże Ciało"], CancellationToken.None);

        await using var c3 = NewContext();
        var data = await new EfMarketDataStore(c3, clock).GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(0.9, data.OccupancyRate);
        Assert.Equal(75, data.DemandScore);
        Assert.Equal(["Boże Ciało"], data.DemandDrivers);
    }
}
