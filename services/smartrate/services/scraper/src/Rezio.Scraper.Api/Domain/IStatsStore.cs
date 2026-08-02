namespace Rezio.Scraper.Domain;

public interface IStatsStore
{
    void Save(string marketId, IReadOnlyList<MarketDailyStats> stats);
    IReadOnlyList<MarketDailyStats> Get(string marketId, DateOnly from, DateOnly to);
}
