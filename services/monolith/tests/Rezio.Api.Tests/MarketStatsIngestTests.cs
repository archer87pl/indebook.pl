using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class MarketStatsIngestTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();
    private static readonly DateOnly Day = new(2026, 9, 15);

    [Fact]
    public async Task Ingested_occupancy_is_reflected_in_prices()
    {
        var ingest = await _client.PostAsJsonAsync("/v1/internal/market-stats", new
        {
            market_id = "mkt_gdansk",
            stats = new[]
            {
                new { date = Day.ToString("yyyy-MM-dd"), median_price = 400m, occupancy_rate = 0.95, active_listings = 12 }
            }
        });
        Assert.Equal(HttpStatusCode.Accepted, ingest.StatusCode);
        var ingestJson = JsonNode.Parse(await ingest.Content.ReadAsStringAsync())!;
        Assert.Equal(1, (int)ingestJson["ingested_days"]!);

        var resp = await _client.GetAsync($"/v1/listings/lst_demo/prices?from={Day:yyyy-MM-dd}&to={Day:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        var price = json["prices"]!.AsArray().Single()!;

        // fallback (no ingest) would use 0.70 occupancy -> factor 1.10; ingested 0.95 -> factor 1.15
        Assert.Equal(1.15, (double)price["components"]!["market_occupancy"]!);
    }
}
