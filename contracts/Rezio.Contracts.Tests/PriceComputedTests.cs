using Rezio.Contracts;

namespace Rezio.Contracts.Tests;

public class PriceComputedTests
{
    [Fact]
    public void Namespace_is_exactly_Rezio_Contracts()
    {
        // MassTransit dopasowuje wiadomości po URN z namespace+typ — pilnujemy stałości.
        Assert.Equal("Rezio.Contracts", typeof(PriceComputed).Namespace);
        Assert.Equal("Rezio.Contracts", typeof(RateLine).Namespace);
    }

    [Fact]
    public void Price_computed_carries_rate_lines()
    {
        var evt = new PriceComputed(
            ListingId: "lst_demo",
            ConnectionId: "con_beds24_1",
            ExternalListingId: "beds24-listing-1",
            Currency: "PLN",
            From: new DateOnly(2026, 8, 1),
            To: new DateOnly(2026, 8, 2),
            Rates: [new RateLine(new DateOnly(2026, 8, 1), 350m), new RateLine(new DateOnly(2026, 8, 2), 380m)]);

        Assert.Equal(2, evt.Rates.Count);
        Assert.Equal(350m, evt.Rates[0].Price);
        Assert.Equal("PLN", evt.Currency);
    }
}
