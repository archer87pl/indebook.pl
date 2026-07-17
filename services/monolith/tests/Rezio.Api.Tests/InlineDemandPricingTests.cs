using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class InlineDemandPricingTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Boze_Cialo_long_weekend_gets_inline_demand_uplift_without_any_event()
    {
        // No event/consumer is involved anywhere in this test: demand for mkt_gdansk (Seaside)
        // must come purely from CalendarSignals + DemandScoreCalculator computed inline.
        var from = new DateOnly(2026, 6, 4);
        var to = new DateOnly(2026, 6, 7);

        var resp = await _client.GetAsync($"/v1/listings/lst_demo/prices?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        var prices = json["prices"]!.AsArray();
        var bozeCialo = prices.Single(p => (string)p!["date"]! == "2026-06-04")!;

        var drivers = bozeCialo["components"]!["demand_drivers"]!.AsArray().Select(n => (string)n!).ToList();
        Assert.Contains("Boże Ciało", drivers);

        // demand factor > 1.0 <=> demand score > 50 (DemandFactor.For: 50 -> 1.00)
        Assert.True((double)bozeCialo["components"]!["demand"]! > 1.0);
    }
}
