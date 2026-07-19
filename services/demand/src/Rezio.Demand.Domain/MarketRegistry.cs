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
        new Market("mkt_swinoujscie", "Świnoujście", MarketType.Seaside, Voivodeship.Zachodniopomorskie),
        new Market("mkt_kolobrzeg", "Kołobrzeg", MarketType.Seaside, Voivodeship.Zachodniopomorskie),
        new Market("mkt_wladyslawowo", "Władysławowo", MarketType.Seaside, Voivodeship.Pomorskie),
        new Market("mkt_gdansk", "Gdańsk", MarketType.Seaside, Voivodeship.Pomorskie),
        new Market("mkt_poznan", "Poznań", MarketType.CityTourist, Voivodeship.Wielkopolskie),
        new Market("mkt_torun", "Toruń", MarketType.CityTourist, Voivodeship.KujawskoPomorskie),
        new Market("mkt_lodz", "Łódź", MarketType.CityBusiness, Voivodeship.Lodzkie),
        new Market("mkt_warszawa", "Warszawa", MarketType.CityBusiness, Voivodeship.Mazowieckie),
        new Market("mkt_lublin", "Lublin", MarketType.CityTourist, Voivodeship.Lubelskie),
        new Market("mkt_wroclaw", "Wrocław", MarketType.CityTourist, Voivodeship.Dolnoslaskie),
        new Market("mkt_karpacz", "Karpacz", MarketType.Mountains, Voivodeship.Dolnoslaskie),
        new Market("mkt_katowice", "Katowice", MarketType.CityBusiness, Voivodeship.Slaskie),
        new Market("mkt_szczyrk", "Szczyrk", MarketType.Mountains, Voivodeship.Slaskie),
        new Market("mkt_krakow", "Kraków", MarketType.CityTourist, Voivodeship.Malopolskie),
        new Market("mkt_krynica", "Krynica-Zdrój", MarketType.Mountains, Voivodeship.Malopolskie),
        new Market("mkt_zakopane", "Zakopane", MarketType.Mountains, Voivodeship.Malopolskie),
    }.ToDictionary(m => m.Id);

    public Market? Find(string marketId) => Markets.GetValueOrDefault(marketId);
}
