namespace Rezio.Scraper.Domain;

/// <summary>
/// Zamiana surowych wydarzeń ze źródła na dzienny sygnał popytu.
///
/// Skali pojedynczego wydarzenia NIE da się odczytać z Discovery API — nie ma
/// tam pojemności obiektu ani frekwencji. Zamiast ją zmyślać, bierzemy sygnał,
/// który faktycznie widzimy: ile wydarzeń kwalifikuje się w rynku danego dnia.
/// Noc z pięcioma koncertami realnie zapełnia miasto bardziej niż noc z jednym.
///
/// Świadome ograniczenie: pojedynczy festiwal na 30 tys. osób wygląda tu tak
/// samo jak jeden klubowy koncert. Naprawi to dopiero źródło z pojemnością
/// obiektu albo osobny wykaz dużych imprez — dlatego emitujemy JEDEN sygnał
/// na dobę (nie po jednym na wydarzenie), żeby nie mnożyć błędu przez liczbę
/// pozycji i nie rozpychać wyniku sufitem.
/// </summary>
public static class EventCollector
{
    /// <summary>Kategorie, które realnie generują noclegi. Reszta (np. kino) odpada.</summary>
    private static readonly HashSet<string> DemandSegments =
        new(StringComparer.OrdinalIgnoreCase) { "Music", "Sports", "Arts & Theatre" };

    private const int MediumFrom = 2;
    private const int LargeFrom = 5;

    public static IReadOnlyList<MarketEventDay> Collect(IEnumerable<SourceEvent> events) =>
        events
            .Where(e => DemandSegments.Contains(e.Segment))
            .DistinctBy(e => e.ExternalRef)
            .GroupBy(e => e.Date)
            .OrderBy(g => g.Key)
            .Select(g =>
            {
                var names = g.Select(e => e.Name).OrderBy(n => n, StringComparer.Ordinal).ToList();
                var scale = names.Count >= LargeFrom
                    ? "Large"
                    : names.Count >= MediumFrom
                        ? "Medium"
                        : "Small";

                return new MarketEventDay(g.Key, [new EventLine(Summarize(names), scale)]);
            })
            .ToList();

    /// <summary>Etykieta dla właściciela: nazwa wydarzenia albo „X i N innych".</summary>
    private static string Summarize(IReadOnlyList<string> names) =>
        names.Count == 1 ? names[0] : $"{names[0]} i {names.Count - 1} inne wydarzenia";
}
