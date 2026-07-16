namespace Rezio.Demand.Domain;

public static class WinterBreakCalendar
{
    // Harmonogram MEN; odświeżany corocznie (rok bez wpisu => brak sygnału ferii).
    private static readonly IReadOnlyDictionary<int, (DateOnly From, DateOnly To, Voivodeship[] Regions)[]> Schedule =
        new Dictionary<int, (DateOnly, DateOnly, Voivodeship[])[]>
        {
            [2026] =
            [
                (new DateOnly(2026, 1, 19), new DateOnly(2026, 2, 1),
                    [Voivodeship.Mazowieckie, Voivodeship.Pomorskie, Voivodeship.Podlaskie,
                     Voivodeship.Swietokrzyskie, Voivodeship.WarminskoMazurskie]),
                (new DateOnly(2026, 2, 2), new DateOnly(2026, 2, 15),
                    [Voivodeship.Dolnoslaskie, Voivodeship.KujawskoPomorskie, Voivodeship.Lodzkie,
                     Voivodeship.Zachodniopomorskie, Voivodeship.Malopolskie, Voivodeship.Opolskie]),
                (new DateOnly(2026, 2, 16), new DateOnly(2026, 3, 1),
                    [Voivodeship.Podkarpackie, Voivodeship.Lubelskie, Voivodeship.Wielkopolskie,
                     Voivodeship.Lubuskie, Voivodeship.Slaskie]),
            ],
        };

    public static bool Covers(Voivodeship voivodeship, DateOnly date) =>
        Schedule.TryGetValue(date.Year, out var rows) &&
        rows.Any(r => date >= r.From && date <= r.To && r.Regions.Contains(voivodeship));
}
