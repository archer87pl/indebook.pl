namespace Rezio.Pricing.Domain.Factors;

public static class OccupancyFactor
{
    public static double For(double occupancyRate) => occupancyRate switch
    {
        >= 0.85 => 1.15,
        >= 0.70 => 1.10,
        >= 0.50 => 1.00,
        >= 0.30 => 0.95,
        _ => 0.90
    };
}
