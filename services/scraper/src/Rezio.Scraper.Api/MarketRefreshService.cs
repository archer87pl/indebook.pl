using System.Text.Json;

namespace Rezio.Scraper.Api;

/// <summary>
/// Cykliczne odświeżanie danych rynkowych i wydarzeń dla wszystkich rynków.
///
/// Do tej pory `/v1/scrape-jobs` i `/v1/event-jobs` trzeba było wołać ręcznie,
/// więc silnik cen jechał na syntetycznym obłożeniu i zerze wydarzeń, dopóki
/// ktoś nie kliknął. Ten serwis jest zapłonem dla całego pipeline'u.
///
/// Włącza się, gdy skonfigurowano MONOLITH_URL — dzięki temu testy hostujące
/// aplikację w pamięci (WebApplicationFactory) nie zaczynają nagle chodzić po
/// sieci. Wyłącznik awaryjny: REFRESH_ENABLED=0.
/// </summary>
public sealed class MarketRefreshService(
    IServiceScopeFactory scopes,
    IConfiguration configuration,
    ILogger<MarketRefreshService> logger) : BackgroundService
{
    private static readonly TimeSpan StartupDelay = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan BetweenMarkets = TimeSpan.FromSeconds(2);

    private TimeSpan Interval =>
        TimeSpan.FromHours(double.TryParse(configuration["REFRESH_INTERVAL_HOURS"], out var h) && h > 0
            ? h
            : 24);

    private int StatsHorizonDays =>
        int.TryParse(configuration["REFRESH_STATS_DAYS"], out var d) && d > 0 ? d : 30;

    private int EventsHorizonDays =>
        int.TryParse(configuration["REFRESH_EVENTS_DAYS"], out var d) && d > 0 ? d : 180;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!IsEnabled(configuration))
        {
            logger.LogInformation("Market refresh disabled (no MONOLITH_URL or REFRESH_ENABLED=0)");
            return;
        }

        // nie startujemy razem z procesem — monolit musi zdążyć wstać
        try { await Task.Delay(StartupDelay, stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCycleAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                // jeden zły cykl nie może ubić harmonogramu na zawsze
                logger.LogError(ex, "Market refresh cycle failed");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    /// <summary>
    /// Harmonogram chodzi tylko przy skonfigurowanym MONOLITH_URL — inaczej
    /// testy hostujące aplikację w pamięci zaczęłyby odpytywać sieć.
    /// REFRESH_ENABLED=0 wyłącza go mimo konfiguracji.
    /// </summary>
    public static bool IsEnabled(IConfiguration configuration)
    {
        if (configuration["REFRESH_ENABLED"] == "0") return false;
        return !string.IsNullOrWhiteSpace(configuration["MONOLITH_URL"]);
    }

    private async Task RunCycleAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var provider = scope.ServiceProvider;
        var scraper = provider.GetRequiredService<ScrapeAndPublish>();
        var events = provider.GetService<EventsAndPublish>(); // null bez klucza do Discovery API

        var markets = await LoadMarketIdsAsync(provider, ct);
        if (markets.Count == 0)
        {
            logger.LogWarning("Market refresh: no markets returned by monolith");
            return;
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var statsTo = today.AddDays(StatsHorizonDays);
        var eventsTo = today.AddDays(EventsHorizonDays);
        var refreshed = 0;

        foreach (var marketId in markets)
        {
            if (ct.IsCancellationRequested) return;
            try
            {
                await scraper.RunAsync(marketId, today, statsTo, ct);
                if (events is not null) await events.RunAsync(marketId, today, eventsTo, ct);
                refreshed++;
            }
            catch (Exception ex)
            {
                // padnięcie jednego rynku nie może zatrzymać pozostałych 88
                logger.LogWarning(ex, "Market refresh failed for {MarketId}", marketId);
            }

            // rozkładamy ruch w czasie — limity Discovery API to 5 zapytań/s
            try { await Task.Delay(BetweenMarkets, ct); }
            catch (OperationCanceledException) { return; }
        }

        logger.LogInformation("Market refresh done: {Refreshed}/{Total} markets", refreshed, markets.Count);
    }

    private async Task<IReadOnlyList<string>> LoadMarketIdsAsync(
        IServiceProvider provider, CancellationToken ct)
    {
        var client = provider.GetRequiredService<IHttpClientFactory>().CreateClient();
        client.BaseAddress = new Uri(configuration["MONOLITH_URL"]!);

        using var response = await client.GetAsync("/v1/markets", ct);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        if (!document.RootElement.TryGetProperty("markets", out var list)
            || list.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return list.EnumerateArray()
            .Select(m => m.TryGetProperty("id", out var id) ? id.GetString() : null)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!)
            .ToList();
    }
}
