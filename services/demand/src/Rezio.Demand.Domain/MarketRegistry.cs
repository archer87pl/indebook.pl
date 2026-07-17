namespace Rezio.Demand.Domain;

public sealed record Market(string Id, string Name, MarketType Type, Voivodeship Voivodeship);

public interface IMarketRegistry
{
    Market? Find(string marketId);
}

public sealed class InMemoryMarketRegistry : IMarketRegistry
{
    private static readonly Dictionary<string, Market> Markets = new[]
    {
        new Market("mkt_zakopane", "Zakopane", MarketType.Mountains, Voivodeship.Malopolskie),
        new Market("mkt_gdansk", "Gdańsk", MarketType.Seaside, Voivodeship.Pomorskie),
        new Market("mkt_krakow", "Kraków", MarketType.CityTourist, Voivodeship.Malopolskie),
        new Market("mkt_warszawa", "Warszawa", MarketType.CityBusiness, Voivodeship.Mazowieckie),
    }.ToDictionary(m => m.Id);

    public Market? Find(string marketId) => Markets.GetValueOrDefault(marketId);
}
