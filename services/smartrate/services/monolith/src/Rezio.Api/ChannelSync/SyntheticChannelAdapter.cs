namespace Rezio.ChannelSync.Domain;

/// <summary>
/// Deterministyczny adapter (bez sieci, bez Random) — stoi za tą samą abstrakcją
/// IChannelAdapter, za którą wejdą prawdziwe adaptery Beds24/Smoobu/Hostaway.
/// </summary>
public sealed class SyntheticChannelAdapter(ChannelProvider provider) : IChannelAdapter
{
    private static readonly string[] Markets =
        ["mkt_zakopane", "mkt_gdansk", "mkt_krakow", "mkt_warszawa"];

    public ChannelProvider Provider => provider;
    public IReadOnlyList<RateUpdate>? LastPushedRates { get; private set; }

    private string ProviderSlug => provider.ToString().ToLowerInvariant();

    public Task<IReadOnlyList<ChannelListing>> PullListingsAsync(CancellationToken ct)
    {
        var listings = Enumerable.Range(1, 5).Select(i => new ChannelListing(
            ExternalId: $"{ProviderSlug}-listing-{i}",
            Title: $"{provider} listing {i}",
            MarketId: Markets[(i - 1) % 4])).ToList();
        return Task.FromResult<IReadOnlyList<ChannelListing>>(listings);
    }

    public Task<IReadOnlyList<Reservation>> PullReservationsAsync(DateOnly from, DateOnly to, CancellationToken ct)
    {
        var reservations = Enumerable.Range(1, 5).Select(i =>
        {
            var checkIn = from.AddDays(i);
            return new Reservation(
                ExternalListingId: $"{ProviderSlug}-listing-{i}",
                CheckIn: checkIn,
                CheckOut: checkIn.AddDays(2),
                TotalPrice: 200m + i * 50m);
        }).Where(r => r.CheckIn <= to).ToList();
        return Task.FromResult<IReadOnlyList<Reservation>>(reservations);
    }

    public Task PushRatesAsync(string externalListingId, IReadOnlyList<RateUpdate> rates, CancellationToken ct)
    {
        LastPushedRates = rates;
        return Task.CompletedTask;
    }
}
