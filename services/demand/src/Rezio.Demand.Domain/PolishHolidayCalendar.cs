namespace Rezio.Demand.Domain;

public static class PolishHolidayCalendar
{
    // Algorytm anonimowy (Meeus/Jones/Butcher) dla kalendarza gregoriańskiego
    public static DateOnly EasterSunday(int year)
    {
        int a = year % 19, b = year / 100, c = year % 100;
        int d = b / 4, e = b % 4, f = (b + 8) / 25, g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4, k = c % 4;
        int l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31;
        int day = (h + l - 7 * m + 114) % 31 + 1;
        return new DateOnly(year, month, day);
    }

    public static IReadOnlyList<Holiday> ForYear(int year)
    {
        var easter = EasterSunday(year);
        var holidays = new List<Holiday>
        {
            new(new DateOnly(year, 1, 1), "Nowy Rok"),
            new(new DateOnly(year, 1, 6), "Trzech Króli"),
            new(easter, "Wielkanoc"),
            new(easter.AddDays(1), "Poniedziałek Wielkanocny"),
            new(new DateOnly(year, 5, 1), "Święto Pracy"),
            new(new DateOnly(year, 5, 3), "Święto Konstytucji 3 Maja"),
            new(easter.AddDays(49), "Zielone Świątki"),
            new(easter.AddDays(60), "Boże Ciało"),
            new(new DateOnly(year, 8, 15), "Wniebowzięcie NMP"),
            new(new DateOnly(year, 11, 1), "Wszystkich Świętych"),
            new(new DateOnly(year, 11, 11), "Święto Niepodległości"),
            new(new DateOnly(year, 12, 25), "Boże Narodzenie"),
            new(new DateOnly(year, 12, 26), "Drugi dzień Świąt"),
        };
        if (year >= 2025)
            holidays.Add(new Holiday(new DateOnly(year, 12, 24), "Wigilia")); // ustawowo wolna od 2025

        return holidays.OrderBy(h => h.Date).ToList();
    }
}
