namespace Rezio.Demand.Domain;

public sealed record SignalWeights(int Holiday, int LongWeekend, int Bridge, int HolidayEve, int WinterBreak);

public static class DemandWeights
{
    public static readonly IReadOnlyDictionary<MarketType, SignalWeights> ByMarketType =
        new Dictionary<MarketType, SignalWeights>
        {
            [MarketType.Mountains]    = new(Holiday: 15, LongWeekend: 25, Bridge: 20, HolidayEve: 8, WinterBreak: 25),
            [MarketType.Seaside]      = new(Holiday: 10, LongWeekend: 20, Bridge: 15, HolidayEve: 5, WinterBreak: 5),
            [MarketType.CityTourist]  = new(Holiday: 12, LongWeekend: 18, Bridge: 12, HolidayEve: 6, WinterBreak: 8),
            [MarketType.CityBusiness] = new(Holiday: -8, LongWeekend: -10, Bridge: -5, HolidayEve: 0, WinterBreak: 0),
        };
}
