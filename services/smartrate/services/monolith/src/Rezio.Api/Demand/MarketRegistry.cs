namespace Rezio.Demand.Domain;

public sealed record Market(string Id, string Name, MarketType Type, Voivodeship Voivodeship);

public interface IMarketRegistry
{
    Market? Find(string marketId);
    IReadOnlyList<Market> All();
}
