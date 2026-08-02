namespace Rezio.Demand.Domain;

public sealed record DemandScore(DateOnly Date, int Score, IReadOnlyList<string> Drivers);

public static class DemandScoreCalculator
{
    public const int Baseline = 50;

    private static readonly IReadOnlyList<EventSignal> NoEvents = [];

    public static DemandScore Score(
        MarketType marketType,
        Voivodeship voivodeship,
        DaySignals signals,
        IReadOnlyList<EventSignal>? events = null)
    {
        var weights = DemandWeights.ByMarketType[marketType];

        // Sygnały kalendarzowe nie sumują się: priorytet długi weekend > mostek > święto > przeddzień
        var calendar = signals switch
        {
            { InLongWeekend: true } => weights.LongWeekend,
            { IsBridge: true } => weights.Bridge,
            { IsHoliday: true } => weights.Holiday,
            { IsHolidayEve: true } => weights.HolidayEve,
            _ => 0
        };

        // Wydarzenia SUMUJĄ się i dokładają na wierzchu kalendarza — festiwal
        // w długi weekend to realnie więcej popytu niż każde z osobna. Własny
        // sufit chroni przed tym, żeby jedno źle oszacowane wydarzenie nie
        // przybiło score'u do 100 i nie wywindowało ceny do max_price.
        var eventList = events ?? NoEvents;
        var eventBonus = Math.Min(
            weights.EventCap,
            eventList.Sum(e => e.Scale switch
            {
                EventScale.Large => weights.EventLarge,
                EventScale.Medium => weights.EventMedium,
                _ => weights.EventSmall
            }));

        var winterBreak = WinterBreakCalendar.Covers(voivodeship, signals.Date);
        var score = Math.Clamp(
            Baseline + calendar + (winterBreak ? weights.WinterBreak : 0) + eventBonus, 0, 100);

        var drivers = new List<string>();
        if (signals.HolidayName is not null) drivers.Add(signals.HolidayName);
        if (signals.InLongWeekend) drivers.Add("długi weekend");
        if (signals.IsBridge) drivers.Add("mostek");
        if (signals.IsHolidayEve) drivers.Add("przeddzień święta");
        if (winterBreak) drivers.Add($"ferie zimowe ({VoivodeshipNames.Polish(voivodeship)})");
        drivers.AddRange(eventList.Select(e => e.Name));

        return new DemandScore(signals.Date, score, drivers);
    }
}
