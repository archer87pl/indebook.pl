namespace Rezio.Pricing.Domain.Factors;

public static class DayOfWeekFactor
{
    public static double For(DateOnly date) => date.DayOfWeek switch
    {
        DayOfWeek.Friday or DayOfWeek.Saturday => 1.15,
        _ => 1.00
    };
}
