using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Scraper.Api.Tests;

public class ScraperEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Scrape_job_then_stats_roundtrip()
    {
        var job = await _client.PostAsJsonAsync("/v1/scrape-jobs",
            new { market_id = "mkt_zakopane", from = "2026-08-01", to = "2026-08-07" });
        Assert.Equal(HttpStatusCode.OK, job.StatusCode);
        var jobJson = JsonNode.Parse(await job.Content.ReadAsStringAsync())!;
        Assert.Equal(30, (int)jobJson["listings_scraped"]!);
        Assert.Equal(7, (int)jobJson["days_aggregated"]!);

        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/stats?from=2026-08-01&to=2026-08-07");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("mkt_zakopane", (string)json["market_id"]!);
        var stats = json["stats"]!.AsArray();
        Assert.Equal(7, stats.Count);
        Assert.Equal(30, (int)stats[0]!["active_listings"]!);
        Assert.True((decimal)stats[0]!["median_price"]! > 0);
    }

    [Fact]
    public async Task Scrape_job_for_unknown_market_returns_404()
    {
        var resp = await _client.PostAsJsonAsync("/v1/scrape-jobs",
            new { market_id = "mkt_nope", from = "2026-08-01", to = "2026-08-07" });
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Stats_inverted_range_returns_400()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/stats?from=2026-08-07&to=2026-08-01");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Stats_for_unknown_market_returns_404()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_nope/stats?from=2026-08-01&to=2026-08-07");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Health_returns_healthy_status_json()
    {
        var resp = await _client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("Healthy", (string)json["status"]!);
    }
}
