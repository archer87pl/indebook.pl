using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Rezio.Pricing.Api.Persistence;

public sealed class EfMarketDataStore(PricingDbContext db, TimeProvider clock) : IMarketDataStore
{
    private static readonly TimeSpan Freshness = TimeSpan.FromDays(7);
    private static readonly IReadOnlyList<string> NoDrivers = [];

    public async Task SetStatsAsync(string marketId, DateOnly date, double occupancyRate, CancellationToken ct)
    {
        var row = await db.MarketData.FindAsync([marketId, date], ct);
        if (row is null)
        {
            db.MarketData.Add(new MarketDataRecord
            {
                MarketId = marketId, Date = date, OccupancyRate = occupancyRate,
                DemandDriversJson = "[]", LastWrittenAt = clock.GetUtcNow()
            });
        }
        else
        {
            row.OccupancyRate = occupancyRate;
            row.LastWrittenAt = clock.GetUtcNow();
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task SetDemandAsync(string marketId, DateOnly date, int score, IReadOnlyList<string> drivers, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(drivers);
        var row = await db.MarketData.FindAsync([marketId, date], ct);
        if (row is null)
        {
            db.MarketData.Add(new MarketDataRecord
            {
                MarketId = marketId, Date = date, DemandScore = score,
                DemandDriversJson = json, LastWrittenAt = clock.GetUtcNow()
            });
        }
        else
        {
            row.DemandScore = score;
            row.DemandDriversJson = json;
            row.LastWrittenAt = clock.GetUtcNow();
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task<MarketDayData> GetAsync(string marketId, DateOnly date, CancellationToken ct)
    {
        var empty = new MarketDayData(null, null, NoDrivers);
        var row = await db.MarketData.AsNoTracking()
            .FirstOrDefaultAsync(x => x.MarketId == marketId && x.Date == date, ct);
        if (row is null || clock.GetUtcNow() - row.LastWrittenAt > Freshness)
            return empty;

        var drivers = JsonSerializer.Deserialize<List<string>>(row.DemandDriversJson) ?? [];
        return new MarketDayData(row.OccupancyRate, row.DemandScore, drivers, row.LastWrittenAt);
    }
}
