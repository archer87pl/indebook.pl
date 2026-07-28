using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class DemandEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Zakopane_boze_cialo_returns_75_with_drivers()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/demand?from=2026-06-04&to=2026-06-07");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("mkt_zakopane", (string)json["market_id"]!);
        var scores = json["scores"]!.AsArray();
        Assert.Equal(4, scores.Count);
        Assert.Equal("2026-06-04", (string)scores[0]!["date"]!);
        Assert.Equal(75, (int)scores[0]!["score"]!);
        Assert.Contains("Boże Ciało", scores[0]!["drivers"]!.AsArray().Select(n => (string)n!));
    }

    [Fact]
    public async Task Unknown_market_returns_404_problem_json()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_nope/demand?from=2026-06-04&to=2026-06-07");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Inverted_range_returns_400_problem_json()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/demand?from=2026-06-07&to=2026-06-04");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Malformed_from_date_returns_400()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/demand?from=2026-13-99&to=2026-06-07");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Missing_to_parameter_returns_400()
    {
        var resp = await _client.GetAsync("/v1/markets/mkt_zakopane/demand?from=2026-06-04");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
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
