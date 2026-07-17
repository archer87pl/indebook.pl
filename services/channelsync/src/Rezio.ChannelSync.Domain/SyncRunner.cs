namespace Rezio.ChannelSync.Domain;

public sealed record SyncResult(string ConnectionId, int ListingsPulled, int ReservationsPulled);

public sealed class SyncRunner
{
    public async Task<SyncResult> SyncAsync(
        IChannelAdapter adapter, string connectionId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var listings = await adapter.PullListingsAsync(ct);
        var reservations = await adapter.PullReservationsAsync(from, to, ct);
        return new SyncResult(connectionId, listings.Count, reservations.Count);
    }
}
