using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Demand.Api.Tests;

public class PublishDemandEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Known_market_returns_202_with_published_days()
    {
        var resp = await _client.PostAsJsonAsync("/v1/markets/mkt_zakopane/publish-demand",
            new { from = "2026-06-04", to = "2026-06-07" });
        Assert.Equal(HttpStatusCode.Accepted, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal(4, (int)json["published_days"]!);
    }

    [Fact]
    public async Task Unknown_market_returns_404()
    {
        var resp = await _client.PostAsJsonAsync("/v1/markets/mkt_nope/publish-demand",
            new { from = "2026-06-04", to = "2026-06-07" });
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Inverted_range_returns_400()
    {
        var resp = await _client.PostAsJsonAsync("/v1/markets/mkt_zakopane/publish-demand",
            new { from = "2026-06-07", to = "2026-06-04" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
