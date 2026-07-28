using Rezio.Demand.Domain;

namespace Rezio.Demand.Domain.Tests;

public class CalendarSignalsTests
{
    private static DaySignals For(string date)
    {
        var d = DateOnly.Parse(date);
        return CalendarSignals.ForRange(d, d).Single();
    }

    [Fact]
    public void Boze_cialo_2026_is_holiday_in_long_weekend()
    {
        var s = For("2026-06-04"); // czwartek, Boże Ciało; piątek = mostek, potem weekend => ciąg 4 dni
        Assert.True(s.IsHoliday);
        Assert.Equal("Boże Ciało", s.HolidayName);
        Assert.True(s.InLongWeekend);
        Assert.False(s.IsBridge);
        Assert.False(s.IsHolidayEve);
    }

    [Fact]
    public void Friday_after_boze_cialo_is_bridge_in_long_weekend()
    {
        var s = For("2026-06-05");
        Assert.False(s.IsHoliday);
        Assert.True(s.IsBridge);
        Assert.True(s.InLongWeekend);
    }

    [Fact]
    public void Majowka_friday_2026_is_holiday_in_long_weekend()
    {
        var s = For("2026-05-01"); // piątek, Święto Pracy + weekend => ciąg 3 dni
        Assert.True(s.IsHoliday);
        Assert.True(s.InLongWeekend);
    }

    [Fact]
    public void Assumption_2026_on_saturday_is_holiday_but_not_long_weekend()
    {
        var s = For("2026-08-15"); // sobota; ciąg sob+niedz = 2 dni
        Assert.True(s.IsHoliday);
        Assert.False(s.InLongWeekend);
    }

    [Fact]
    public void Day_before_assumption_2026_is_holiday_eve_only()
    {
        var s = For("2026-08-14"); // piątek roboczy przed sobotnim świętem
        Assert.False(s.IsHoliday);
        Assert.False(s.IsBridge);
        Assert.False(s.InLongWeekend);
        Assert.True(s.IsHolidayEve);
    }

    [Fact]
    public void Ordinary_tuesday_has_no_signals()
    {
        var s = For("2026-03-10");
        Assert.Equal(new DaySignals(DateOnly.Parse("2026-03-10"), false, null, false, false, false), s);
    }

    [Fact]
    public void Range_returns_one_entry_per_day_inclusive()
    {
        var list = CalendarSignals.ForRange(DateOnly.Parse("2026-06-01"), DateOnly.Parse("2026-06-07"));
        Assert.Equal(7, list.Count);
        Assert.Equal(DateOnly.Parse("2026-06-01"), list[0].Date);
        Assert.Equal(DateOnly.Parse("2026-06-07"), list[6].Date);
    }
}
