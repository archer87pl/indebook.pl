namespace Rezio.Scraper.Domain;

public static class ListingClassifier
{
    private static readonly (ListingCategory Category, string[] Keywords)[] CategoryRules =
    [
        (ListingCategory.Agroturystyka,     ["agroturystyka", "gospodarstwo", "farm stay"]),
        (ListingCategory.GlampingNietypowe, ["glamping", "jurta", "yurt", "treehouse", "domek na drzewie", "tent"]),
        (ListingCategory.HotelAparthotel,   ["hotel", "aparthotel"]),
        (ListingCategory.Pokoj,             ["private_room", "shared_room"]),
        (ListingCategory.PensjonatWilla,    ["willa", "villa", "pensjonat", "guesthouse"]),
        (ListingCategory.DomDomek,          ["domek", "domku", "chata", "chałupa", "chalet", "cabin", "cottage", "house"]),
    ];

    private static readonly (string Tag, string[] Keywords)[] TagRules =
    [
        ("widok_gory",    ["widok na góry", "widokiem na góry", "mountain view", "tatr", "karkonosze", "bieszczady", "pieniny", "beskid"]),
        ("widok_woda",    ["widok na morze", "widok na jezioro", "sea view", "lake view", "nad jeziorem", "nad morzem"]),
        ("przy_stoku",    ["przy stoku", "ski-in", "przy wyciągu"]),
        ("blisko_plazy",  ["przy plaży", "blisko plaży", "beachfront", "dostęp do plaży"]),
        ("sauna_balia",   ["sauna", "balia"]),
        ("jacuzzi",       ["jacuzzi", "hot tub", "whirlpool"]),
        ("kominek",       ["kominek", "komink", "fireplace"]),
        ("zwierzeta_ok",  ["pets allowed", "zwierzęta mile widziane", "akceptujemy zwierzęta"]),
        ("agro_zwierzeta", ["alpaki", "kozy", "kucyki", "mini zoo", "zwierzęta gospodarskie"]),
    ];

    public static ClassifiedListing Classify(RawListing raw)
    {
        var text = $"{raw.Title} {raw.PropertyType} {string.Join(' ', raw.Amenities)}"
            .ToLowerInvariant();

        var category = ListingCategory.Apartament;
        foreach (var (cat, keywords) in CategoryRules)
        {
            if (keywords.Any(text.Contains)) { category = cat; break; }
        }

        var tags = TagRules
            .Where(rule => rule.Keywords.Any(text.Contains))
            .Select(rule => rule.Tag)
            .ToList();

        return new ClassifiedListing(raw, category, tags);
    }
}
