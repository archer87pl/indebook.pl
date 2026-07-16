namespace Rezio.Pricing.Domain.Factors;

public static class DemandFactor
{
    // 0 → 0.75, 50 → 1.00, 100 → 1.25
    public static double For(int demandScore) => 1.0 + (demandScore - 50) / 200.0;
}
