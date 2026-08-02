namespace Rezio.Pricing.Domain.Factors;

public static class SeasonFactor
{
    // Indeks 0 = styczeń … 11 = grudzień
    private static readonly IReadOnlyDictionary<MarketType, double[]> Curves =
        new Dictionary<MarketType, double[]>
        {
            [MarketType.Mountains]    = [1.25, 1.20, 0.95, 0.85, 0.90, 1.00, 1.15, 1.15, 0.95, 0.90, 0.85, 1.10],
            [MarketType.Seaside]      = [0.75, 0.75, 0.80, 0.90, 1.00, 1.15, 1.35, 1.35, 1.00, 0.85, 0.75, 0.80],
            [MarketType.CityBusiness] = [0.95, 1.00, 1.05, 1.05, 1.05, 1.00, 0.90, 0.90, 1.05, 1.05, 1.00, 0.95],
            [MarketType.CityTourist]  = [0.85, 0.85, 0.95, 1.05, 1.10, 1.10, 1.15, 1.15, 1.05, 1.00, 0.90, 1.05],
        };

    public static double For(MarketType marketType, DateOnly date) => Curves[marketType][date.Month - 1];
}
