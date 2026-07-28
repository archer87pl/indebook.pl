using System.Data.Common;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Time.Testing;
using Rezio.Api.Persistence;

namespace Rezio.Api.Tests;

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

    // NOTE: a naive Task.WhenAll(storeA.Set..., storeB.Set...) does NOT reliably reach the
    // catch(DbUpdateException) branch in EfMarketDataStore.UpsertAsync. Empirically (10/10 runs,
    // instrumented with a temporary marker write in the catch block) storeA's whole write
    // (FindAsync -> Add -> SaveChangesAsync) completes before storeB's FindAsync even runs, because
    // Microsoft.Data.Sqlite's async calls over this shared in-memory connection resolve without a
    // real async suspension point, so C# never interleaves the two "concurrent" tasks. storeB's
    // FindAsync then sees the already-committed row and takes the UPDATE path — the catch never fires.
    //
    // To force the actual race deterministically, this test uses an EF Core command interceptor to
    // pause ctxB's INSERT command *after* its FindAsync already returned null but *before* the SQL
    // executes, lets ctxA fully insert+commit the same key while ctxB is paused, then resumes ctxB.
    // ctxB's INSERT now collides with ctxA's committed row on the primary key, guaranteeing a
    // DbUpdateException that UpsertAsync must catch, detach, reload, and merge onto.
    private sealed class PauseBeforeInsertInterceptor : DbCommandInterceptor
    {
        private readonly TaskCompletionSource _paused = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _resume = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task PausedSignal => _paused.Task;

        public void Resume() => _resume.TrySetResult();

        // The Sqlite provider executes INSERT via ExecuteReaderAsync (it appends a trailing
        // SELECT/RETURNING for change tracking), not ExecuteNonQueryAsync — so this is the hook
        // that actually fires. NonQueryExecutingAsync is overridden too as a defensive fallback in
        // case that provider detail changes.
        public override async ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
        {
            if (command.CommandText.Contains("INSERT", StringComparison.OrdinalIgnoreCase))
            {
                _paused.TrySetResult();
                await _resume.Task;
            }
            return await base.NonQueryExecutingAsync(command, eventData, result, ct);
        }

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        {
            if (command.CommandText.Contains("INSERT", StringComparison.OrdinalIgnoreCase))
            {
                _paused.TrySetResult();
                await _resume.Task;
            }
            return await base.ReaderExecutingAsync(command, eventData, result, ct);
        }
    }

    [Fact]
    public async Task Concurrent_first_inserts_of_same_key_do_not_throw_and_merge()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 6, 4, 12, 0, 0, TimeSpan.Zero));
        await using var ctxA = NewContext();

        var interceptor = new PauseBeforeInsertInterceptor();
        var optionsB = new DbContextOptionsBuilder<PricingDbContext>().UseSqlite(_conn).AddInterceptors(interceptor).Options;
        await using var ctxB = new PricingDbContext(optionsB);
        ctxB.Database.EnsureCreated();

        var storeA = new EfMarketDataStore(ctxA, clock);
        var storeB = new EfMarketDataStore(ctxB, clock);

        // storeB starts its first insert of the key; its FindAsync returns null (row doesn't exist
        // yet), it Adds a new row, and pauses right before the INSERT command executes.
        var taskB = storeB.SetDemandAsync("mkt_gdansk", D, 75, ["Boże Ciało"], CancellationToken.None);
        await interceptor.PausedSignal.WaitAsync(TimeSpan.FromSeconds(10));

        // While storeB is paused mid-insert, storeA independently does the first insert of the SAME
        // key and fully commits it.
        await storeA.SetStatsAsync("mkt_gdansk", D, 0.9, CancellationToken.None);

        // Resume storeB: its INSERT now collides with storeA's already-committed row on the primary
        // key -> DbUpdateException -> UpsertAsync's catch branch detaches, reloads the winner, and
        // merges storeB's field onto it.
        interceptor.Resume();
        await taskB;

        await using var ctxC = NewContext();
        var data = await new EfMarketDataStore(ctxC, clock).GetAsync("mkt_gdansk", D, CancellationToken.None);
        Assert.Equal(0.9, data.OccupancyRate);
        Assert.Equal(75, data.DemandScore);
        Assert.Equal(["Boże Ciało"], data.DemandDrivers);
    }
}
