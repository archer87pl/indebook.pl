using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class PublishPricesEndpointTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    private async Task<string> CreateConnection(string provider = "beds24")
    {
        var resp = await _client.PostAsJsonAsync("/v1/connections", new { provider });
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        return (string)json["id"]!;
    }

    [Fact]
    public async Task Known_listing_returns_202_with_published_days()
    {
        // PricePusher now validates the connection in-process, so it must exist beforehand.
        var connectionId = await CreateConnection();

        var resp = await _client.PostAsJsonAsync("/v1/listings/lst_demo/publish-prices",
            new { connection_id = connectionId, external_listing_id = "beds24-listing-1", from = "2026-08-01", to = "2026-08-07" });
        Assert.Equal(HttpStatusCode.Accepted, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal(7, (int)json["published_days"]!);
    }

    [Fact]
    public async Task Unknown_listing_returns_404()
    {
        var resp = await _client.PostAsJsonAsync("/v1/listings/lst_nope/publish-prices",
            new { connection_id = "con_beds24_1", external_listing_id = "ext-1", from = "2026-08-01", to = "2026-08-07" });
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Inverted_range_returns_400()
    {
        var resp = await _client.PostAsJsonAsync("/v1/listings/lst_demo/publish-prices",
            new { connection_id = "con_beds24_1", external_listing_id = "ext-1", from = "2026-08-07", to = "2026-08-01" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
