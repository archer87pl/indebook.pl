using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class SyntheticListingSourceTests
{
    private readonly SyntheticListingSource _source = new();

    [Fact]
    public async Task Known_market_returns_30_deterministic_listings()
    {
        var first = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);
        var second = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);

        Assert.Equal(30, first.Count);
        Assert.Equal(first, second); // pełny determinizm (rekordy porównywane strukturalnie po ExternalRef itd.)
        Assert.Equal("syn_mkt_zakopane_001", first[0].ExternalRef);
    }

    [Fact]
    public async Task Any_market_id_returns_30()
    {
        var listings = await _source.GetListingsAsync("mkt_anything", CancellationToken.None);
        Assert.Equal(30, listings.Count);
        Assert.Equal("syn_mkt_anything_001", listings[0].ExternalRef);
    }

    [Fact]
    public async Task Empty_market_id_returns_empty()
    {
        Assert.Empty(await _source.GetListingsAsync("", CancellationToken.None));
    }

    [Fact]
    public async Task Whitespace_market_id_returns_empty()
    {
        Assert.Empty(await _source.GetListingsAsync("   ", CancellationToken.None));
    }

    [Fact]
    public async Task Price_formula_weekday_and_weekend()
    {
        var listings = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);
        var l1 = listings[0]; // i = 1, cena bazowa 150 + 1*25 = 175
        var calendar = await _source.GetCalendarAsync(l1,
            DateOnly.Parse("2026-08-11"), DateOnly.Parse("2026-08-14"), CancellationToken.None);

        Assert.Equal(4, calendar.Count);
        Assert.Equal(175m, calendar[0].Price);  // wtorek 11.08 — cena bazowa
        Assert.Equal(210m, calendar[3].Price);  // piątek 14.08 — ×1.2
    }

    [Fact]
    public async Task Availability_formula_is_deterministic()
    {
        var listings = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);
        var l1 = listings[0]; // i = 1
        var date = DateOnly.Parse("2026-08-11");
        var expected = (1 * 31 + date.DayNumber * 7) % 10 >= 3;

        var day = (await _source.GetCalendarAsync(l1, date, date, CancellationToken.None)).Single();
        Assert.Equal(expected, day.Available);
    }

    [Fact]
    public async Task Listings_cycle_through_six_title_templates()
    {
        var listings = await _source.GetListingsAsync("mkt_zakopane", CancellationToken.None);
        Assert.StartsWith("Apartament w centrum", listings[0].Title);   // i=1
        Assert.StartsWith("Domek z widokiem na Tatry", listings[1].Title); // i=2
        Assert.StartsWith("Glamping", listings[5].Title);               // i=6 → 6%6=0
    }
}
