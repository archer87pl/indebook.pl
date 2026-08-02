using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class SyncRunnerTests
{
    [Fact]
    public void Registry_generates_deterministic_ids_per_provider()
    {
        var registry = new ConnectionRegistry();
        var a = registry.Add(ChannelProvider.Beds24);
        var b = registry.Add(ChannelProvider.Beds24);
        var c = registry.Add(ChannelProvider.Smoobu);

        Assert.Equal("con_beds24_1", a.Id);
        Assert.Equal("con_beds24_2", b.Id);
        Assert.Equal("con_smoobu_1", c.Id);
        Assert.Equal("connected", a.Status);
    }

    [Fact]
    public void Registry_find_and_all()
    {
        var registry = new ConnectionRegistry();
        var a = registry.Add(ChannelProvider.Hostaway);
        Assert.Equal(a, registry.Find(a.Id));
        Assert.Null(registry.Find("con_nope_1"));
        Assert.Single(registry.All());
    }

    [Fact]
    public async Task Sync_pulls_listings_and_reservations()
    {
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Beds24);
        var runner = new SyncRunner();
        var result = await runner.SyncAsync(adapter, "con_beds24_1", new DateOnly(2026, 8, 1), new DateOnly(2026, 9, 1), CancellationToken.None);

        Assert.Equal("con_beds24_1", result.ConnectionId);
        Assert.Equal(5, result.ListingsPulled);
        Assert.Equal(5, result.ReservationsPulled);
    }
}
