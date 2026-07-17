using System.Net.Http.Json;
using System.Text.Json;
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api;

public sealed record MarketStatsIngestLine(DateOnly Date, decimal MedianPrice, double OccupancyRate, int ActiveListings);
public sealed record MarketStatsIngestRequest(string MarketId, IReadOnlyList<MarketStatsIngestLine> Stats);

public sealed class ScrapeAndPublish(
    ScrapeRunner runner, IStatsStore store, HttpClient monolith, ILogger<ScrapeAndPublish> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    public async Task<ScrapeResult> RunAsync(string marketId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var result = await runner.RunAsync(marketId, from, to, ct);
        if (result.DaysAggregated > 0)
        {
            var stats = store.Get(marketId, from, to)
                .Select(s => new MarketStatsIngestLine(s.Date, s.MedianPrice, s.OccupancyRate, s.ActiveListings))
                .ToList();
            try
            {
                using var resp = await monolith.PostAsJsonAsync(
                    "/v1/internal/market-stats", new MarketStatsIngestRequest(marketId, stats), JsonOptions, ct);
                resp.EnsureSuccessStatusCode();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to POST market stats to monolith for {MarketId}", marketId);
            }
        }
        return result;
    }
}
