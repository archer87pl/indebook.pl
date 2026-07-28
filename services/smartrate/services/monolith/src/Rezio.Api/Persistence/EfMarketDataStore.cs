using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Rezio.Api.Persistence;

public sealed class EfMarketDataStore(PricingDbContext db, TimeProvider clock) : IMarketDataStore
{
    private static readonly IReadOnlyList<string> NoDrivers = [];

    public Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct) =>
        UpsertAsync(marketId, date, r =>
        {
            r.OccupancyRate = occupancyRate;
            r.LastWrittenAt = clock.GetUtcNow();
        }, ct);

    public Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(drivers);
        return UpsertAsync(marketId, date, r =>
        {
            r.DemandScore = score;
            r.DemandDriversJson = json;
            r.LastWrittenAt = clock.GetUtcNow();
        }, ct);
    }

    private async Task UpsertAsync(string marketId, DateOnly date, Action<MarketDataRecord> apply, CancellationToken ct)
    {
        var row = await db.MarketData.FindAsync([marketId, date], ct);
        if (row is null)
        {
            row = new MarketDataRecord { MarketId = marketId, Date = date, DemandDriversJson = "[]" };
            apply(row);
            db.MarketData.Add(row);
            try
            {
                await db.SaveChangesAsync(ct);
                return;
            }
            catch (DbUpdateException)
            {
                // Racing insert won — detach our failed add, reload the winner, merge onto it.
                db.Entry(row).State = EntityState.Detached;
                row = await db.MarketData.FindAsync([marketId, date], ct);
                if (row is null)
                    throw; // extremely unlikely: conflict but row not found
            }
        }
        apply(row);
        await db.SaveChangesAsync(ct);
    }

    public async Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct)
    {
        var empty = new MarketDayData(null, null, NoDrivers);
        var row = await db.MarketData.AsNoTracking()
            .FirstOrDefaultAsync(x => x.MarketId == marketId && x.Date == date, ct);
        if (row is null || clock.GetUtcNow() - row.LastWrittenAt > MarketDataFreshness.Window)
            return empty;

        var drivers = JsonSerializer.Deserialize<List<string>>(row.DemandDriversJson) ?? [];
        return new MarketDayData(row.OccupancyRate, row.DemandScore, drivers, row.LastWrittenAt);
    }
}
