using Rezio.Pricing.Domain.Factors;

namespace Rezio.Pricing.Domain.Tests;

public class MarketFactorsTests
{
    [Theory]
    [InlineData(0.90, 1.15)]
    [InlineData(0.85, 1.15)]
    [InlineData(0.70, 1.10)]
    [InlineData(0.50, 1.00)]
    [InlineData(0.30, 0.95)]
    [InlineData(0.10, 0.90)]
    public void Occupancy_bands(double rate, double expected) =>
        Assert.Equal(expected, OccupancyFactor.For(rate));

    [Theory]
    [InlineData(0, 0.75)]
    [InlineData(50, 1.00)]
    [InlineData(80, 1.15)]
    [InlineData(100, 1.25)]
    public void Demand_maps_linearly(int score, double expected) =>
        Assert.Equal(expected, DemandFactor.For(score), precision: 10);
}
