using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class SyntheticChannelAdapterTests
{
    [Fact]
    public async Task Pulls_five_deterministic_listings()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Smoobu);
        var first = await adapter.PullListingsAsync(CancellationToken.None);
        var second = await adapter.PullListingsAsync(CancellationToken.None);

        Assert.Equal(5, first.Count);
        Assert.Equal(first, second);
        Assert.Equal("smoobu-listing-1", first[0].ExternalId);
        Assert.Equal("mkt_zakopane", first[0].MarketId);
        Assert.Equal("mkt_gdansk", first[1].MarketId);
    }

    [Fact]
    public async Task Provider_property_reflects_constructor()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Hostaway);
        Assert.Equal(ChannelProvider.Hostaway, adapter.Provider);
    }

    [Fact]
    public async Task Push_records_last_pushed_rates()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Beds24);
        var rates = new[] { new RateUpdate(new DateOnly(2026, 8, 1), 300m) };
        await adapter.PushRatesAsync("beds24-listing-1", rates, CancellationToken.None);

        Assert.Equal(rates, adapter.LastPushedRates);
    }

    [Fact]
    public async Task Pulls_one_reservation_per_listing()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Smoobu);
        var reservations = await adapter.PullReservationsAsync(new DateOnly(2026, 8, 1), new DateOnly(2026, 9, 1), CancellationToken.None);
        Assert.Equal(5, reservations.Count);
        Assert.Equal(new DateOnly(2026, 8, 2), reservations[0].CheckIn); // i=1 → from + 1
        Assert.Equal(250m, reservations[0].TotalPrice);                  // 200 + 1*50
    }
}
