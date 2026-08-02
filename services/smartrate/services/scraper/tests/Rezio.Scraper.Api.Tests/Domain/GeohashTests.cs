using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class GeohashTests
{
    [Fact]
    public void Koduje_znane_punkty_referencyjne()
    {
        // wartości kontrolne z powszechnie cytowanych przykładów geohasha
        Assert.Equal("ezs42", Geohash.Encode(42.6, -5.6, 5));
        Assert.Equal("u4pruyd", Geohash.Encode(57.64911, 10.40744, 7));
    }

    [Fact]
    public void Dluzszy_hash_zaczyna_sie_tym_samym_prefiksem()
    {
        var short5 = Geohash.Encode(50.0614, 19.9366, 5); // Kraków
        var long9 = Geohash.Encode(50.0614, 19.9366, 9);

        Assert.StartsWith(short5, long9);
    }

    [Fact]
    public void Bliskie_punkty_dziela_prefiks_a_odlegle_nie()
    {
        var krakow = Geohash.Encode(50.0614, 19.9366, 5);
        var wieliczka = Geohash.Encode(49.9833, 20.0546, 5); // ~12 km
        var gdansk = Geohash.Encode(54.3520, 18.6466, 5);

        Assert.Equal(krakow[..3], wieliczka[..3]);
        Assert.NotEqual(krakow[..3], gdansk[..3]);
    }

    [Fact]
    public void Odrzuca_niedodatnia_precyzje()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Geohash.Encode(50, 20, 0));
    }
}
