using Rezio.Demand.Domain;

namespace Rezio.Demand.Domain.Tests;

public class WinterBreakCalendarTests
{
    [Theory]
    [InlineData(Voivodeship.Malopolskie, "2026-02-03", true)]   // tura 2: 02.02-15.02
    [InlineData(Voivodeship.Malopolskie, "2026-02-15", true)]   // ostatni dzień tury 2
    [InlineData(Voivodeship.Malopolskie, "2026-01-25", false)]  // tura 1 nie obejmuje małopolskiego
    [InlineData(Voivodeship.Mazowieckie, "2026-01-25", true)]   // tura 1: 19.01-01.02
    [InlineData(Voivodeship.Slaskie, "2026-02-20", true)]       // tura 3: 16.02-01.03
    [InlineData(Voivodeship.Slaskie, "2026-03-01", true)]       // ostatni dzień tury 3
    [InlineData(Voivodeship.Pomorskie, "2026-02-20", false)]    // pomorskie było w turze 1
    [InlineData(Voivodeship.Malopolskie, "2026-07-15", false)]  // lato — nie ferie zimowe
    [InlineData(Voivodeship.Mazowieckie, "2026-01-19", true)]   // pierwszy dzień tury 1
    [InlineData(Voivodeship.Malopolskie, "2026-02-02", true)]   // pierwszy dzień tury 2
    [InlineData(Voivodeship.Malopolskie, "2026-02-01", false)]  // dzień przed turą 2
    [InlineData(Voivodeship.Slaskie, "2026-02-16", true)]       // pierwszy dzień tury 3
    public void Covers_matches_men_2026_schedule(Voivodeship v, string date, bool expected) =>
        Assert.Equal(expected, WinterBreakCalendar.Covers(v, DateOnly.Parse(date)));

    [Theory]
    [InlineData(Voivodeship.Slaskie, "2027-01-18", true)]        // tura 1: pierwszy dzień (18.01)
    [InlineData(Voivodeship.Slaskie, "2027-01-31", true)]        // tura 1: ostatni dzień (31.01)
    [InlineData(Voivodeship.Slaskie, "2027-01-17", false)]       // dzień przed turą 1
    [InlineData(Voivodeship.Slaskie, "2027-02-01", false)]       // dzień po turze 1
    [InlineData(Voivodeship.Mazowieckie, "2027-02-01", true)]    // tura 2: pierwszy dzień (01.02)
    [InlineData(Voivodeship.Mazowieckie, "2027-02-14", true)]    // tura 2: ostatni dzień (14.02)
    [InlineData(Voivodeship.Mazowieckie, "2027-01-31", false)]   // dzień przed turą 2
    [InlineData(Voivodeship.Mazowieckie, "2027-02-15", false)]   // dzień po turze 2
    [InlineData(Voivodeship.Malopolskie, "2027-02-15", true)]    // tura 3: pierwszy dzień (15.02)
    [InlineData(Voivodeship.Malopolskie, "2027-02-28", true)]    // tura 3: ostatni dzień (28.02)
    [InlineData(Voivodeship.Malopolskie, "2027-02-14", false)]   // dzień przed turą 3
    [InlineData(Voivodeship.Malopolskie, "2027-03-01", false)]   // dzień po turze 3
    [InlineData(Voivodeship.Mazowieckie, "2027-01-25", false)]   // mazowieckie jest w turze 2, nie w turze 1
    [InlineData(Voivodeship.Slaskie, "2027-02-20", false)]       // śląskie było w turze 1, nie w turze 3
    public void Covers_matches_men_2027_schedule(Voivodeship v, string date, bool expected) =>
        Assert.Equal(expected, WinterBreakCalendar.Covers(v, DateOnly.Parse(date)));

    [Fact]
    public void Unknown_year_returns_false()
    {
        Assert.False(WinterBreakCalendar.Covers(Voivodeship.Malopolskie, new DateOnly(2031, 2, 3)));
    }

    [Fact]
    public void Polish_names_are_lowercase_with_diacritics()
    {
        Assert.Equal("małopolskie", VoivodeshipNames.Polish(Voivodeship.Malopolskie));
        Assert.Equal("warmińsko-mazurskie", VoivodeshipNames.Polish(Voivodeship.WarminskoMazurskie));
    }
}
