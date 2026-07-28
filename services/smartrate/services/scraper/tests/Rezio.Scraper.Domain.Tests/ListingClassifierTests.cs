using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class ListingClassifierTests
{
    private static RawListing Listing(string title, string type, params string[] amenities) =>
        new("syn_test_001", title, type, amenities, Guests: 4, Bedrooms: 2);

    [Fact]
    public void Mountain_cottage_with_fireplace_and_sauna()
    {
        var c = ListingClassifier.Classify(Listing("Domek z widokiem na Tatry", "entire_home/chalet", "fireplace", "sauna"));
        Assert.Equal(ListingCategory.DomDomek, c.Category);
        Assert.Contains("widok_gory", c.Tags);
        Assert.Contains("kominek", c.Tags);
        Assert.Contains("sauna_balia", c.Tags);
    }

    [Fact]
    public void Agrotourism_with_alpacas_wins_over_cottage()
    {
        var c = ListingClassifier.Classify(Listing("Agroturystyka u Basi – alpaki", "entire_home/cottage"));
        Assert.Equal(ListingCategory.Agroturystyka, c.Category);
        Assert.Contains("agro_zwierzeta", c.Tags);
    }

    [Fact]
    public void Plain_city_apartment_has_no_tags()
    {
        var c = ListingClassifier.Classify(Listing("Apartament w centrum", "entire_home/apartment"));
        Assert.Equal(ListingCategory.Apartament, c.Category);
        Assert.Empty(c.Tags);
    }

    [Fact]
    public void Private_room_is_pokoj()
    {
        var c = ListingClassifier.Classify(Listing("Przytulny pokój blisko dworca", "private_room"));
        Assert.Equal(ListingCategory.Pokoj, c.Category);
    }

    [Fact]
    public void Villa_near_beach_with_hot_tub()
    {
        var c = ListingClassifier.Classify(Listing("Willa Bałtyk przy plaży", "entire_home/villa", "hot tub"));
        Assert.Equal(ListingCategory.PensjonatWilla, c.Category);
        Assert.Contains("blisko_plazy", c.Tags);
        Assert.Contains("jacuzzi", c.Tags);
    }

    [Fact]
    public void Glamping_yurt_under_tatras()
    {
        var c = ListingClassifier.Classify(Listing("Glamping pod Tatrami – jurta", "tent"));
        Assert.Equal(ListingCategory.GlampingNietypowe, c.Category);
        Assert.Contains("widok_gory", c.Tags);
    }

    [Fact]
    public void Hotel_type_wins_over_mountain_sounding_title()
    {
        var c = ListingClassifier.Classify(Listing("Hotel Górski", "hotel_room"));
        Assert.Equal(ListingCategory.HotelAparthotel, c.Category);
    }

    [Fact]
    public void Matching_is_case_insensitive()
    {
        var c = ListingClassifier.Classify(Listing("DOMEK Z KOMINKIEM", "ENTIRE_HOME/CHALET"));
        Assert.Equal(ListingCategory.DomDomek, c.Category);
        Assert.Contains("kominek", c.Tags);
    }

    [Fact]
    public void Apartment_with_living_room_amenity_is_not_pokoj()
    {
        var c = ListingClassifier.Classify(Listing("Apartament Skałka", "entire_home/apartment", "pokój dzienny z aneksem"));
        Assert.Equal(ListingCategory.Apartament, c.Category);
    }
}
