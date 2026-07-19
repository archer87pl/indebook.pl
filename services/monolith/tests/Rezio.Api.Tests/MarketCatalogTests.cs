using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class MarketCatalogTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Markets_endpoint_returns_full_catalog_with_coords()
    {
        var resp = await _client.GetAsync("/v1/markets");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var arr = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!["markets"]!.AsArray();
        Assert.True(arr.Count >= 40);
        var first = arr[0]!;
        Assert.NotNull(first["id"]); Assert.NotNull(first["name"]);
        Assert.NotNull(first["type"]); Assert.NotNull(first["voivodeship"]);
        Assert.True((double)first["lat"]! > 48 && (double)first["lat"]! < 55); // w granicach PL
    }

    [Theory]
    [InlineData("mkt_sopot", "Seaside")]
    [InlineData("mkt_rzeszow", "CityBusiness")]
    [InlineData("mkt_szklarska", "Mountains")]
    [InlineData("mkt_zamosc", "CityTourist")]
    public async Task New_seeded_markets_are_quotable(string market, string type)
    {
        var r = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = market, base_price = 400, min_price = 200, max_price = 1200,
            from = "2026-08-01", to = "2026-08-03" });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var json = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
        Assert.Equal(type, (string)json["market_type"]!);
    }

    [Fact]
    public async Task Existing_market_id_still_works()
    {
        var r = await _client.PostAsJsonAsync("/v1/quote", new {
            market_id = "mkt_zakopane", base_price = 450, min_price = 280, max_price = 1200,
            from = "2026-06-04", to = "2026-06-04" });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var json = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
        Assert.Equal("Mountains", (string)json["market_type"]!);
    }
}
