using Rezio.Contracts;

namespace Rezio.Contracts.Tests;

public class MarketDataEventsTests
{
    [Fact]
    public void Namespaces_are_exactly_Rezio_Contracts()
    {
        Assert.Equal("Rezio.Contracts", typeof(MarketStatsUpdated).Namespace);
        Assert.Equal("Rezio.Contracts", typeof(DemandScoreUpdated).Namespace);
        Assert.Equal("Rezio.Contracts", typeof(MarketStatsLine).Namespace);
        Assert.Equal("Rezio.Contracts", typeof(DemandScoreLine).Namespace);
    }

    [Fact]
    public void Market_stats_updated_carries_daily_lines()
    {
        var evt = new MarketStatsUpdated("mkt_gdansk",
            [new MarketStatsLine(new DateOnly(2026, 6, 4), 320m, 0.85, 30)]);
        Assert.Single(evt.Stats);
        Assert.Equal(0.85, evt.Stats[0].OccupancyRate);
    }

    [Fact]
    public void Demand_score_updated_carries_scores_with_drivers()
    {
        var evt = new DemandScoreUpdated("mkt_gdansk",
            [new DemandScoreLine(new DateOnly(2026, 6, 4), 70, ["Boże Ciało", "długi weekend"])]);
        Assert.Equal(70, evt.Scores[0].Score);
        Assert.Contains("Boże Ciało", evt.Scores[0].Drivers);
    }
}
