namespace Rezio.Demand.Domain;

public sealed record DaySignals(
    DateOnly Date,
    bool IsHoliday,
    string? HolidayName,
    bool InLongWeekend,
    bool IsBridge,
    bool IsHolidayEve);
