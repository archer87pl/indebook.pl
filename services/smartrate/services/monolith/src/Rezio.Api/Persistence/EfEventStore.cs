using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Rezio.Api.Persistence;

public sealed class EfEventStore(PricingDbContext db, TimeProvider clock) : IEventStore
{
    private static readonly IReadOnlyList<MarketEvent> None = [];

    public async Task SetEventsAsync(
        string marketId, DateOnly date, IReadOnlyList<MarketEvent> events, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(events);
        var row = await db.MarketEvents.FindAsync([marketId, date], ct);
        if (row is null)
        {
            row = new EventRecord { MarketId = marketId, Date = date };
            Apply(row, json);
            db.MarketEvents.Add(row);
            try
            {
                await db.SaveChangesAsync(ct);
                return;
            }
            catch (DbUpdateException)
            {
                // wyścig na wstawieniu — odłącz nieudany wpis i dołóż się do zwycięzcy
                db.Entry(row).State = EntityState.Detached;
                row = await db.MarketEvents.FindAsync([marketId, date], ct);
                if (row is null) throw;
            }
        }

        Apply(row, json);
        await db.SaveChangesAsync(ct);
    }

    private void Apply(EventRecord row, string json)
    {
        row.EventsJson = json;
        row.LastWrittenAt = clock.GetUtcNow();
    }

    public async Task<IReadOnlyList<MarketEvent>> GetAsync(
        string marketId, DateOnly date, CancellationToken ct)
    {
        var row = await db.MarketEvents
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.MarketId == marketId && r.Date == date, ct);

        if (row is null) return None;
        if (clock.GetUtcNow() - row.LastWrittenAt > EventFreshness.Window) return None;

        return JsonSerializer.Deserialize<List<MarketEvent>>(row.EventsJson) ?? [];
    }
}
