namespace Rezio.ChannelSync.Domain;

public interface IChannelAdapter
{
    ChannelProvider Provider { get; }
    Task<IReadOnlyList<ChannelListing>> PullListingsAsync(CancellationToken ct);
    Task<IReadOnlyList<Reservation>> PullReservationsAsync(DateOnly from, DateOnly to, CancellationToken ct);
    Task PushRatesAsync(string externalListingId, IReadOnlyList<RateUpdate> rates, CancellationToken ct);
}
