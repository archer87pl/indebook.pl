using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class EventCollectorTests
{
    private static SourceEvent Concert(string reference, string name, int day, string segment = "Music") =>
        new(reference, name, new DateOnly(2026, 8, day), segment);

    [Fact]
    public void Jedno_wydarzenie_daje_skale_Small_i_wlasna_nazwe()
    {
        var days = EventCollector.Collect([Concert("e1", "Koncert Kultu", 14)]);

        var day = Assert.Single(days);
        var line = Assert.Single(day.Events);
        Assert.Equal("Small", line.Scale);
        Assert.Equal("Koncert Kultu", line.Name);
    }

    [Fact]
    public void Kilka_wydarzen_tego_samego_dnia_podbija_skale()
    {
        var medium = EventCollector.Collect([Concert("a", "A", 14), Concert("b", "B", 14)]);
        var large = EventCollector.Collect(
            Enumerable.Range(0, 5).Select(i => Concert($"e{i}", $"E{i}", 14)));

        Assert.Equal("Medium", Assert.Single(medium).Events[0].Scale);
        Assert.Equal("Large", Assert.Single(large).Events[0].Scale);
    }

    [Fact]
    public void Dzien_z_wieloma_wydarzeniami_ma_JEDEN_sygnal_z_podsumowaniem()
    {
        var days = EventCollector.Collect(
            [Concert("a", "Alfa", 14), Concert("b", "Beta", 14), Concert("c", "Gamma", 14)]);

        var line = Assert.Single(Assert.Single(days).Events);
        Assert.Equal("Alfa i 2 inne wydarzenia", line.Name);
    }

    [Fact]
    public void Duplikaty_po_tym_samym_identyfikatorze_nie_podbijaja_skali()
    {
        var days = EventCollector.Collect(
            [Concert("ten-sam", "Koncert", 14), Concert("ten-sam", "Koncert", 14)]);

        Assert.Equal("Small", Assert.Single(days).Events[0].Scale);
    }

    [Fact]
    public void Kategorie_bez_wplywu_na_noclegi_sa_odrzucane()
    {
        var days = EventCollector.Collect(
            [Concert("f", "Seans", 14, "Film"), Concert("m", "Miscellaneous", 14, "Miscellaneous")]);

        Assert.Empty(days);
    }

    [Fact]
    public void Wydarzenia_grupuja_sie_per_doba_i_wychodza_chronologicznie()
    {
        var days = EventCollector.Collect(
            [Concert("b", "B", 16), Concert("a", "A", 14), Concert("c", "C", 15)]);

        Assert.Equal(
            [new DateOnly(2026, 8, 14), new DateOnly(2026, 8, 15), new DateOnly(2026, 8, 16)],
            days.Select(d => d.Date));
    }
}
