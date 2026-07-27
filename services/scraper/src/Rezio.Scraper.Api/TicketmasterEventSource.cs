using System.Text.Json;
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api;

/// <summary>
/// Ticketmaster Discovery API v2 — oficjalne API z kluczem, nie scrapowanie,
/// więc bez ryzyka regulaminowego i bez walki z anti-botem.
///
/// Limity dostawcy: 5000 wywołań na dobę i 5 na sekundę, a stronicowanie sięga
/// tylko 1000 pozycji (size * page &lt; 1000). Stąd size=200 i twardy limit
/// stron — przy 89 rynkach pełne odświeżenie mieści się w dobowej puli
/// z dużym zapasem.
/// </summary>
public sealed class TicketmasterEventSource(
    HttpClient http, string apiKey, ILogger<TicketmasterEventSource> logger) : IEventSource
{
    private const int PageSize = 200;
    private const int MaxPages = 5; // 5 × 200 = 1000, czyli sufit stronicowania API
    private const int RadiusKm = 30;

    // 5 zapytań na sekundę to limit dostawcy — trzymamy się bezpiecznie poniżej
    private static readonly TimeSpan BetweenRequests = TimeSpan.FromMilliseconds(250);

    public async Task<IReadOnlyList<SourceEvent>> GetEventsAsync(
        MarketGeo market, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var events = new List<SourceEvent>();
        var geoPoint = Geohash.Encode(market.Lat, market.Lng);

        for (var page = 0; page < MaxPages; page++)
        {
            if (page > 0) await Task.Delay(BetweenRequests, ct);

            var url = "events.json"
                + $"?apikey={Uri.EscapeDataString(apiKey)}"
                + $"&geoPoint={geoPoint}&radius={RadiusKm}&unit=km"
                + "&countryCode=PL"
                + $"&startDateTime={from:yyyy-MM-dd}T00:00:00Z"
                + $"&endDateTime={to:yyyy-MM-dd}T23:59:59Z"
                + $"&size={PageSize}&page={page}";

            using var response = await http.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                // brak wydarzeń dla rynku to normalny przypadek (404), reszta to problem konfiguracji
                logger.LogWarning("Discovery API returned {Status} for {MarketId}",
                    (int)response.StatusCode, market.MarketId);
                break;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            var pageEvents = ParsePage(document.RootElement).ToList();
            events.AddRange(pageEvents);

            if (pageEvents.Count < PageSize) break;
            if (!HasMorePages(document.RootElement, page)) break;
        }

        return events;
    }

    private static bool HasMorePages(JsonElement root, int currentPage) =>
        root.TryGetProperty("page", out var page)
        && page.TryGetProperty("totalPages", out var total)
        && total.TryGetInt32(out var totalPages)
        && currentPage + 1 < totalPages;

    /// <summary>Wyciąga wydarzenia z jednej strony odpowiedzi; pozycje bez daty pomijamy.</summary>
    public static IEnumerable<SourceEvent> ParsePage(JsonElement root)
    {
        if (!root.TryGetProperty("_embedded", out var embedded)
            || !embedded.TryGetProperty("events", out var events)
            || events.ValueKind != JsonValueKind.Array)
        {
            yield break;
        }

        foreach (var item in events.EnumerateArray())
        {
            var id = item.TryGetProperty("id", out var idElement) ? idElement.GetString() : null;
            var name = item.TryGetProperty("name", out var nameElement) ? nameElement.GetString() : null;
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(name)) continue;

            if (!item.TryGetProperty("dates", out var dates)
                || !dates.TryGetProperty("start", out var start)
                || !start.TryGetProperty("localDate", out var localDate)
                || !DateOnly.TryParse(localDate.GetString(), out var date))
            {
                continue; // TBA/TBD — bez daty nie ma sygnału popytu
            }

            yield return new SourceEvent(id, name, date, Segment(item));
        }
    }

    private static string Segment(JsonElement item) =>
        item.TryGetProperty("classifications", out var classifications)
        && classifications.ValueKind == JsonValueKind.Array
        && classifications.EnumerateArray().FirstOrDefault() is { ValueKind: JsonValueKind.Object } first
        && first.TryGetProperty("segment", out var segment)
        && segment.TryGetProperty("name", out var segmentName)
            ? segmentName.GetString() ?? ""
            : "";
}
