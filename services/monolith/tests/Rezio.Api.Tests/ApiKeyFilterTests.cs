using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class ApiKeyFilterTests
{
    private static WebApplicationFactory<Program> FactoryWithKey(string? key) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            if (key is not null)
                b.UseSetting("SMARTRATE_API_KEY", key);
        });

    private static object QuoteBody() => new
    {
        market_id = "mkt_gdansk",
        base_price = 200m,
        min_price = 140m,
        max_price = 360m,
        from = "2026-08-01",
        to = "2026-08-03",
    };

    [Fact]
    public async Task Quote_without_key_is_unauthorized_when_key_configured()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/v1/quote", QuoteBody());
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Quote_with_wrong_key_is_unauthorized()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", "nie-ten");
        var resp = await client.PostAsJsonAsync("/v1/quote", QuoteBody());
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Quote_with_correct_key_succeeds()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", "sekret");
        var resp = await client.PostAsJsonAsync("/v1/quote", QuoteBody());
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task Markets_requires_key_too()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/v1/markets")).StatusCode);

        client.DefaultRequestHeaders.Add("X-Api-Key", "sekret");
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/v1/markets")).StatusCode);
    }

    [Fact]
    public async Task Without_configured_key_endpoints_stay_open()
    {
        using var factory = FactoryWithKey(null);
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/v1/markets")).StatusCode);
    }

    [Fact]
    public async Task Health_is_never_gated()
    {
        using var factory = FactoryWithKey("sekret");
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).StatusCode);
    }
}
