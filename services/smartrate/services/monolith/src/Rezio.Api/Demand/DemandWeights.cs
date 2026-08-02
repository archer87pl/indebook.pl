namespace Rezio.Demand.Domain;

public sealed record SignalWeights(
    int Holiday,
    int LongWeekend,
    int Bridge,
    int HolidayEve,
    int WinterBreak,
    int EventSmall,
    int EventMedium,
    int EventLarge,
    int EventCap);

public static class DemandWeights
{
    // Miasta biznesowe mają ujemne wagi kalendarzowe (w święta pustoszeją), więc
    // wydarzenia są dla nich JEDYNYM dodatnim sygnałem popytu — stąd najwyższe
    // wagi i najwyższy sufit. Góry i morze mają mocny popyt sezonowy, więc
    // wydarzenie dokłada tam proporcjonalnie mniej.
    public static readonly IReadOnlyDictionary<MarketType, SignalWeights> ByMarketType =
        new Dictionary<MarketType, SignalWeights>
        {
            [MarketType.Mountains] = new(
                Holiday: 15, LongWeekend: 25, Bridge: 20, HolidayEve: 8, WinterBreak: 25,
                EventSmall: 3, EventMedium: 8, EventLarge: 15, EventCap: 20),
            [MarketType.Seaside] = new(
                Holiday: 10, LongWeekend: 20, Bridge: 15, HolidayEve: 5, WinterBreak: 5,
                EventSmall: 4, EventMedium: 10, EventLarge: 18, EventCap: 22),
            [MarketType.CityTourist] = new(
                Holiday: 12, LongWeekend: 18, Bridge: 12, HolidayEve: 6, WinterBreak: 8,
                EventSmall: 5, EventMedium: 12, EventLarge: 20, EventCap: 25),
            [MarketType.CityBusiness] = new(
                Holiday: -8, LongWeekend: -10, Bridge: -5, HolidayEve: 0, WinterBreak: 0,
                EventSmall: 5, EventMedium: 12, EventLarge: 22, EventCap: 30),
        };
}
