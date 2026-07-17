using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class QuoteEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Quote_for_zakopane_over_corpus_christi_shows_holiday_driver()
    {
        var resp = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_zakopane", base_price = 450, min_price = 280, max_price = 1200,
            from = "2026-06-04", to = "2026-06-07" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("mkt_zakopane", (string)json["market_id"]!);
        Assert.Equal("Mountains", (string)json["market_type"]!);
        var days = json["days"]!.AsArray();
        Assert.Equal(4, days.Count);
        var first = days[0]!; // 2026-06-04 Boże Ciało
        Assert.True((decimal)first["recommended_price"]! > 0);
        Assert.Contains("Boże Ciało", first["demand_drivers"]!.AsArray().Select(n => (string)n!));
        Assert.NotNull(first["components"]!["season"]);
        Assert.Equal("fallback", (string)first["occupancy_source"]!); // brak scrape → fallback 0.70
    }

    [Fact]
    public async Task Unknown_market_returns_404()
    {
        var resp = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_nope", base_price = 300, min_price = 100, max_price = 900,
            from = "2026-06-04", to = "2026-06-07" });
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Inverted_range_returns_400()
    {
        var resp = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_gdansk", base_price = 300, min_price = 100, max_price = 900,
            from = "2026-06-07", to = "2026-06-04" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Business_market_ordinary_day_has_no_positive_drivers()
    {
        // Warszawa, zwykły wtorek 2026-09-08 → demand baseline 50, brak driverów
        var resp = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_warszawa", base_price = 300, min_price = 200, max_price = 650,
            from = "2026-09-08", to = "2026-09-08" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        var day = json["days"]!.AsArray()[0]!;
        Assert.Equal(50, (int)day["demand_score"]!);
        Assert.Empty(day["demand_drivers"]!.AsArray());
    }
}
