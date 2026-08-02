using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class ChannelModelsTests
{
    [Fact]
    public void Rate_update_records_compare_by_value()
    {
        var a = new RateUpdate(new DateOnly(2026, 8, 1), 350m);
        var b = new RateUpdate(new DateOnly(2026, 8, 1), 350m);
        Assert.Equal(a, b);
    }

    [Fact]
    public void Channel_listing_carries_market_binding()
    {
        var l = new ChannelListing("ext-1", "Apartament", "mkt_krakow");
        Assert.Equal("mkt_krakow", l.MarketId);
    }

    [Fact]
    public void Reservation_holds_stay_dates_and_price()
    {
        var r = new Reservation("ext-1", new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 5), 1400m);
        Assert.Equal(4, r.CheckOut.DayNumber - r.CheckIn.DayNumber);
        Assert.Equal(1400m, r.TotalPrice);
    }

    [Fact]
    public void Providers_are_three_known_channel_managers()
    {
        Assert.Equal(3, Enum.GetValues<ChannelProvider>().Length);
        Assert.Contains(ChannelProvider.Beds24, Enum.GetValues<ChannelProvider>());
        Assert.Contains(ChannelProvider.Smoobu, Enum.GetValues<ChannelProvider>());
        Assert.Contains(ChannelProvider.Hostaway, Enum.GetValues<ChannelProvider>());
    }
}
