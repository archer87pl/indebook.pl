using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.ChannelSync.Api.Tests;

public class ChannelSyncEndpointTests(WebApplicationFactory<Program> factory)
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
    public async Task Create_connection_returns_201_with_id_and_status()
    {
        var resp = await _client.PostAsJsonAsync("/v1/connections", new { provider = "smoobu" });
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.StartsWith("con_smoobu_", (string)json["id"]!);
        Assert.Equal("connected", (string)json["status"]!);
        Assert.Equal("smoobu", (string)json["provider"]!);
    }

    [Fact]
    public async Task Unknown_provider_returns_400()
    {
        var resp = await _client.PostAsJsonAsync("/v1/connections", new { provider = "nonsense" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
    }

    [Fact]
    public async Task Get_unknown_connection_returns_404()
    {
        var resp = await _client.GetAsync("/v1/connections/con_beds24_999");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Listings_endpoint_returns_five_for_connection()
    {
        var id = await CreateConnection("hostaway");
        var resp = await _client.GetAsync($"/v1/connections/{id}/listings");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal(5, json["listings"]!.AsArray().Count);
        Assert.StartsWith("hostaway-listing-", (string)json["listings"]![0]!["external_id"]!);
    }

    [Fact]
    public async Task Sync_endpoint_returns_counts()
    {
        var id = await CreateConnection("beds24");
        var resp = await _client.PostAsJsonAsync($"/v1/connections/{id}/sync",
            new { from = "2026-08-01", to = "2026-09-01" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.Equal(5, (int)json["listings_pulled"]!);
        Assert.Equal(5, (int)json["reservations_pulled"]!);
    }

    [Fact]
    public async Task Sync_inverted_range_returns_400()
    {
        var id = await CreateConnection("beds24");
        var resp = await _client.PostAsJsonAsync($"/v1/connections/{id}/sync",
            new { from = "2026-09-01", to = "2026-08-01" });
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
