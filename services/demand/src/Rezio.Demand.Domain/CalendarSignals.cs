namespace Rezio.Demand.Domain;

public static class CalendarSignals
{
    public static IReadOnlyList<DaySignals> ForRange(DateOnly from, DateOnly to)
    {
        var contextStart = from.AddDays(-7);
        var contextEnd = to.AddDays(7);
        var holidays = Enumerable.Range(contextStart.Year, contextEnd.Year - contextStart.Year + 1)
            .SelectMany(PolishHolidayCalendar.ForYear)
            .ToDictionary(h => h.Date, h => h.Name);

        bool IsFree(DateOnly d) =>
            d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday || holidays.ContainsKey(d);

        bool IsBridge(DateOnly d) =>
            !IsFree(d) && IsFree(d.AddDays(-1)) && IsFree(d.AddDays(1));

        bool IsExtendedFree(DateOnly d) => IsFree(d) || IsBridge(d);

        var result = new List<DaySignals>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            var inLongWeekend = false;
            if (IsExtendedFree(d))
            {
                var run = 1;
                for (var b = d.AddDays(-1); IsExtendedFree(b); b = b.AddDays(-1)) run++;
                for (var f = d.AddDays(1); IsExtendedFree(f); f = f.AddDays(1)) run++;
                inLongWeekend = run >= 3;
            }

            var isHolidayEve = !IsExtendedFree(d) && holidays.ContainsKey(d.AddDays(1));

            result.Add(new DaySignals(
                d,
                holidays.ContainsKey(d),
                holidays.GetValueOrDefault(d),
                inLongWeekend,
                IsBridge(d),
                isHolidayEve));
        }
        return result;
    }
}
