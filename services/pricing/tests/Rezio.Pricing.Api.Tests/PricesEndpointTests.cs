using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Pricing.Api.Tests;

public class PricesEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Known_listing_returns_prices_with_component_breakdown()
    {
        var from = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(10);
        var to = from.AddDays(6);

        var resp = await _client.GetAsync($"/v1/listings/lst_demo/prices?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal("lst_demo", (string)json["listing_id"]!);
        Assert.Equal("PLN", (string)json["currency"]!);
        var prices = json["prices"]!.AsArray();
        Assert.Equal(7, prices.Count);
        var first = prices[0]!;
        Assert.True((decimal)first["recommended_price"]! > 0);
        Assert.NotNull(first["components"]!["season"]);
        Assert.NotNull(first["components"]!["day_of_week"]);
        Assert.NotNull(first["components"]!["market_occupancy"]);
    }

    [Fact]
    public async Task Unknown_listing_returns_404_problem_json()
    {
        var resp = await _client.GetAsync("/v1/listings/lst_nope/prices?from=2026-08-01&to=2026-08-07");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Inverted_range_returns_400()
    {
        var resp = await _client.GetAsync("/v1/listings/lst_demo/prices?from=2026-08-07&to=2026-08-01");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Range_over_365_days_returns_400()
    {
        var resp = await _client.GetAsync("/v1/listings/lst_demo/prices?from=2026-01-01&to=2027-06-01");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
