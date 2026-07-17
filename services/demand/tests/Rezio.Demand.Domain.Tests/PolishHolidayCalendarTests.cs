using Rezio.Demand.Domain;

namespace Rezio.Demand.Domain.Tests;

public class PolishHolidayCalendarTests
{
    [Theory]
    [InlineData(2025, "2025-04-20")]
    [InlineData(2026, "2026-04-05")]
    [InlineData(2027, "2027-03-28")]
    public void Easter_sunday_matches_known_dates(int year, string expected) =>
        Assert.Equal(DateOnly.Parse(expected), PolishHolidayCalendar.EasterSunday(year));

    [Fact]
    public void Year_2026_has_14_holidays_including_wigilia()
    {
        var holidays = PolishHolidayCalendar.ForYear(2026);
        Assert.Equal(14, holidays.Count);
        Assert.Contains(holidays, h => h.Date == new DateOnly(2026, 12, 24) && h.Name == "Wigilia");
        Assert.Contains(holidays, h => h.Date == new DateOnly(2026, 6, 4) && h.Name == "Boże Ciało");
        Assert.Contains(holidays, h => h.Date == new DateOnly(2026, 5, 24) && h.Name == "Zielone Świątki");
        Assert.Contains(holidays, h => h.Date == new DateOnly(2026, 4, 6) && h.Name == "Poniedziałek Wielkanocny");
    }

    [Fact]
    public void Year_2024_has_13_holidays_without_wigilia()
    {
        var holidays = PolishHolidayCalendar.ForYear(2024);
        Assert.Equal(13, holidays.Count);
        Assert.DoesNotContain(holidays, h => h.Date == new DateOnly(2024, 12, 24));
    }

    [Fact]
    public void Holidays_are_ordered_from_new_year_to_second_christmas_day()
    {
        var holidays = PolishHolidayCalendar.ForYear(2026);

        var first = holidays[0];
        Assert.Equal(new DateOnly(2026, 1, 1), first.Date);
        Assert.Equal("Nowy Rok", first.Name);

        var last = holidays[^1];
        Assert.Equal(new DateOnly(2026, 12, 26), last.Date);
        Assert.Equal("Drugi dzień Świąt", last.Name);
    }
}
