namespace Rezio.Demand.Domain;

// Celowy duplikat enuma z Rezio.Pricing.Domain — serwisy nie współdzielą bibliotek,
// kontrakty wymieniają przez JSON (przyszłe zdarzenia demand.score.updated).
public enum MarketType { Mountains, Seaside, CityBusiness, CityTourist }
