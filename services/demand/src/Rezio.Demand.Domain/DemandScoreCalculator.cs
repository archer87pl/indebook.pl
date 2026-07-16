namespace Rezio.Demand.Domain;

public sealed record DemandScore(DateOnly Date, int Score, IReadOnlyList<string> Drivers);

public static class DemandScoreCalculator
{
    public const int Baseline = 50;

    public static DemandScore Score(MarketType marketType, Voivodeship voivodeship, DaySignals signals)
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

        var winterBreak = WinterBreakCalendar.Covers(voivodeship, signals.Date);
        var score = Math.Clamp(Baseline + calendar + (winterBreak ? weights.WinterBreak : 0), 0, 100);

        var drivers = new List<string>();
        if (signals.HolidayName is not null) drivers.Add(signals.HolidayName);
        if (signals.InLongWeekend) drivers.Add("długi weekend");
        if (signals.IsBridge) drivers.Add("mostek");
        if (signals.IsHolidayEve) drivers.Add("przeddzień święta");
        if (winterBreak) drivers.Add($"ferie zimowe ({VoivodeshipNames.Polish(voivodeship)})");

        return new DemandScore(signals.Date, score, drivers);
    }
}
