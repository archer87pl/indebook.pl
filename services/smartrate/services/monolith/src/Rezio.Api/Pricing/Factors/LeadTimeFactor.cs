namespace Rezio.Pricing.Domain.Factors;

public static class LeadTimeFactor
{
    public static double For(int daysAhead) => daysAhead switch
    {
        < 0 => 1.00,
        <= 3 => 0.90,
        <= 7 => 0.95,
        <= 90 => 1.00,
        _ => 1.05
    };
}
