using System.Net.Http.Json;
using System.Text.Json;
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api;

public sealed record EventIngestLine(string Name, string Scale);
public sealed record EventIngestDay(DateOnly Date, IReadOnlyList<EventIngestLine> Events);
public sealed record EventsIngestRequest(string MarketId, IReadOnlyList<EventIngestDay> Days);

public sealed record EventJobRequest(string MarketId, DateOnly From, DateOnly To);
public sealed record EventJobResult(string MarketId, int EventsFound, int DaysAffected);

/// <summary>
/// Pobranie wydarzeń dla rynku i wypchnięcie ich do monolitu — ten sam
/// przepływ co przy statystykach rynku: scraper zna świat zewnętrzny,
/// monolit trzyma dane i liczy popyt.
///
/// Pozycję rynku bierzemy z monolitu (`GET /v1/markets`), żeby nie duplikować
/// `markets.json` w drugim serwisie. Wynik jest keszowany na czas życia
/// procesu — lista rynków zmienia się przy wdrożeniu, nie w locie.
/// </summary>
public sealed class EventsAndPublish(
    IEventSource source, HttpClient monolith, ILogger<EventsAndPublish> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    private static IReadOnlyDictionary<string, MarketGeo>? _markets;
    private static readonly SemaphoreSlim MarketsLock = new(1, 1);

    public async Task<EventJobResult?> RunAsync(
        string marketId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var market = await ResolveMarketAsync(marketId, ct);
        if (market is null) return null;

        var raw = await source.GetEventsAsync(market, from, to, ct);
        var days = EventCollector.Collect(raw);

        if (days.Count > 0)
        {
            var payload = new EventsIngestRequest(
                marketId,
                days.Select(d => new EventIngestDay(
                    d.Date,
                    d.Events.Select(e => new EventIngestLine(e.Name, e.Scale)).ToList())).ToList());
            try
            {
                using var response = await monolith.PostAsJsonAsync(
                    "/v1/internal/events", payload, JsonOptions, ct);
                response.EnsureSuccessStatusCode();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to POST events to monolith for {MarketId}", marketId);
            }
        }

        return new EventJobResult(marketId, raw.Count, days.Count);
    }

    private async Task<MarketGeo?> ResolveMarketAsync(string marketId, CancellationToken ct)
    {
        if (_markets is null)
        {
            await MarketsLock.WaitAsync(ct);
            try
            {
                _markets ??= await LoadMarketsAsync(ct);
            }
            finally
            {
                MarketsLock.Release();
            }
        }

        return _markets.TryGetValue(marketId, out var market) ? market : null;
    }

    private async Task<IReadOnlyDictionary<string, MarketGeo>> LoadMarketsAsync(CancellationToken ct)
    {
        var markets = new Dictionary<string, MarketGeo>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var response = await monolith.GetAsync("/v1/markets", ct);
            response.EnsureSuccessStatusCode();

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

            if (document.RootElement.TryGetProperty("markets", out var list)
                && list.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in list.EnumerateArray())
                {
                    if (item.TryGetProperty("id", out var id)
                        && item.TryGetProperty("lat", out var lat)
                        && item.TryGetProperty("lng", out var lng)
                        && id.GetString() is { Length: > 0 } marketId)
                    {
                        markets[marketId] = new MarketGeo(marketId, lat.GetDouble(), lng.GetDouble());
                    }
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to load markets from monolith");
        }

        return markets;
    }
}
