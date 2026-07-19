using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class MarketExpansionTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    private async Task<JsonNode> Quote(string market, string from, string to)
    {
        var r = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = market, base_price = 400, min_price = 200, max_price = 1200, from, to });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
    }

    [Theory]
    [InlineData("mkt_karpacz", "Mountains")]
    [InlineData("mkt_kolobrzeg", "Seaside")]
    [InlineData("mkt_wroclaw", "CityTourist")]
    [InlineData("mkt_lodz", "CityBusiness")]
    [InlineData("mkt_krynica", "Mountains")]
    public async Task New_markets_are_quotable_with_correct_type(string market, string type)
    {
        var json = await Quote(market, "2026-08-01", "2026-08-03");
        Assert.Equal(type, (string)json["market_type"]!);
        Assert.True((decimal)json["days"]!.AsArray()[0]!["recommended_price"]! > 0);
    }

    [Fact]
    public async Task Winter_break_fires_per_voivodeship_on_different_dates()
    {
        // 2026-01-25: pomorskie (Gdańsk) w feriach tura 1; małopolskie (Kraków) jeszcze nie
        var gdansk = await _client.GetAsync("/v1/markets/mkt_gdansk/demand?from=2026-01-25&to=2026-01-25");
        var krakow = await _client.GetAsync("/v1/markets/mkt_krakow/demand?from=2026-01-25&to=2026-01-25");
        var gj = JsonNode.Parse(await gdansk.Content.ReadAsStringAsync())!;
        var kj = JsonNode.Parse(await krakow.Content.ReadAsStringAsync())!;
        var gDrivers = gj["scores"]!.AsArray()[0]!["drivers"]!.AsArray().Select(n => (string)n!).ToList();
        var kDrivers = kj["scores"]!.AsArray()[0]!["drivers"]!.AsArray().Select(n => (string)n!).ToList();
        Assert.Contains(gDrivers, d => d.Contains("ferie zimowe"));   // pomorskie: tak
        Assert.DoesNotContain(kDrivers, d => d.Contains("ferie zimowe")); // małopolskie: nie (tura 2)
    }

    [Fact]
    public async Task Unknown_market_still_404()
    {
        var r = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_atlantyda", base_price = 400, min_price = 200, max_price = 1200,
            from = "2026-08-01", to = "2026-08-03" });
        Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
    }
}
