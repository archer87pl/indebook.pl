namespace Rezio.Scraper.Domain;

/// <summary>
/// Deterministyczne źródło danych rynkowych (bez sieci i bez Random) — stoi za tą samą
/// abstrakcją IListingSource, za którą wejdzie prawdziwy adapter Airbnb/Booking.
/// </summary>
public sealed class SyntheticListingSource : IListingSource
{
    private static readonly HashSet<string> KnownMarkets =
    [
        "mkt_swinoujscie",
        "mkt_kolobrzeg",
        "mkt_wladyslawowo",
        "mkt_gdansk",
        "mkt_poznan",
        "mkt_torun",
        "mkt_lodz",
        "mkt_warszawa",
        "mkt_lublin",
        "mkt_wroclaw",
        "mkt_karpacz",
        "mkt_katowice",
        "mkt_szczyrk",
        "mkt_krakow",
        "mkt_krynica",
        "mkt_zakopane",
    ];

    private static readonly (string Title, string Type)[] Templates =
    [
        ("Glamping – jurta {0}", "tent"),                          // i % 6 == 0
        ("Apartament w centrum {0}", "entire_home/apartment"),     // i % 6 == 1
        ("Domek z widokiem na Tatry {0}", "entire_home/chalet"),   // i % 6 == 2
        ("Przytulny pokój {0}", "private_room"),                   // i % 6 == 3
        ("Willa przy plaży {0}", "entire_home/villa"),             // i % 6 == 4
        ("Agroturystyka pod lasem {0}", "entire_home/cottage"),    // i % 6 == 5
    ];

    private static readonly IReadOnlyList<string> SaunaAmenities = new[] { "sauna" };
    private static readonly IReadOnlyList<string> NoAmenities = Array.Empty<string>();

    public Task<IReadOnlyList<RawListing>> GetListingsAsync(string marketId, CancellationToken ct)
    {
        if (!KnownMarkets.Contains(marketId))
            return Task.FromResult<IReadOnlyList<RawListing>>([]);

        var listings = Enumerable.Range(1, 30).Select(i =>
        {
            var (title, type) = Templates[i % 6];
            return new RawListing(
                ExternalRef: $"syn_{marketId}_{i:D3}",
                Title: string.Format(title, i),
                PropertyType: type,
                Amenities: i % 5 == 0 ? SaunaAmenities : NoAmenities,
                Guests: 2 + i % 6,
                Bedrooms: 1 + i % 3);
        }).ToList();

        return Task.FromResult<IReadOnlyList<RawListing>>(listings);
    }

    public Task<IReadOnlyList<ListingDayObservation>> GetCalendarAsync(
        RawListing listing, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var i = int.Parse(listing.ExternalRef[^3..]);
        var basePrice = 150m + i % 10 * 25m;

        var days = new List<ListingDayObservation>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var weekend = d.DayOfWeek is DayOfWeek.Friday or DayOfWeek.Saturday;
            var price = Math.Round(weekend ? basePrice * 1.2m : basePrice, 0, MidpointRounding.AwayFromZero);
            var available = (i * 31 + d.DayNumber * 7) % 10 >= 3;
            days.Add(new ListingDayObservation(listing.ExternalRef, d, price, available));
        }
        return Task.FromResult<IReadOnlyList<ListingDayObservation>>(days);
    }
}
