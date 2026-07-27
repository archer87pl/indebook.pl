using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

public class EventsIngestTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    private static object QuoteBody(string marketId, string from, string to) => new
    {
        market_id = marketId,
        base_price = 200m,
        min_price = 100m,
        max_price = 900m,
        from,
        to,
    };

    private async Task<JsonNode> QuoteAsync(string marketId, string from, string to)
    {
        var response = await _client.PostAsJsonAsync("/v1/quote", QuoteBody(marketId, from, to));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
    }

    [Fact]
    public async Task Ingest_przyjmuje_wydarzenia_i_zwraca_liczbe_dob()
    {
        var response = await _client.PostAsJsonAsync("/v1/internal/events", new
        {
            market_id = "mkt_gdansk",
            days = new[]
            {
                new { date = "2027-03-05", events = new[] { new { name = "Koncert", scale = "Large" } } },
            },
        });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonNode>();
        Assert.Equal(1, body!["ingested_days"]!.GetValue<int>());
    }

    [Fact]
    public async Task Wydarzenie_podbija_popyt_i_cene_a_nazwa_trafia_do_driverow()
    {
        // osobny rynek i data, żeby nie zderzyć się z innymi testami
        const string market = "mkt_lodz";
        const string date = "2027-04-13"; // wtorek, bez świąt

        var before = await QuoteAsync(market, date, date);
        var demandBefore = before["days"]![0]!["demand_score"]!.GetValue<int>();
        var priceBefore = before["days"]![0]!["recommended_price"]!.GetValue<decimal>();

        await _client.PostAsJsonAsync("/v1/internal/events", new
        {
            market_id = market,
            days = new[]
            {
                new { date, events = new[] { new { name = "Wielki koncert", scale = "Large" } } },
            },
        });

        var after = await QuoteAsync(market, date, date);
        var day = after["days"]![0]!;

        Assert.True(day["demand_score"]!.GetValue<int>() > demandBefore);
        Assert.True(day["recommended_price"]!.GetValue<decimal>() > priceBefore);
        Assert.Contains("Wielki koncert",
            day["demand_drivers"]!.AsArray().Select(n => n!.GetValue<string>()));
    }

    [Fact]
    public async Task Rynek_bez_wydarzen_liczy_popyt_z_samego_kalendarza()
    {
        var quote = await QuoteAsync("mkt_kielce", "2027-05-11", "2027-05-11"); // wtorek
        var day = quote["days"]![0]!;

        // baseline 50 dla miasta biznesowego w zwykły wtorek
        Assert.Equal(50, day["demand_score"]!.GetValue<int>());
    }

    [Fact]
    public async Task Ponowny_ingest_zastepuje_wydarzenia_doby_zamiast_je_dokladac()
    {
        const string market = "mkt_lublin";
        const string date = "2027-06-08";

        async Task IngestAsync(params string[] names) =>
            await _client.PostAsJsonAsync("/v1/internal/events", new
            {
                market_id = market,
                days = new[]
                {
                    new { date, events = names.Select(n => new { name = n, scale = "Small" }).ToArray() },
                },
            });

        await IngestAsync("Pierwszy", "Drugi");
        var withTwo = await QuoteAsync(market, date, date);
        var demandWithTwo = withTwo["days"]![0]!["demand_score"]!.GetValue<int>();

        await IngestAsync("Tylko jeden");
        var withOne = await QuoteAsync(market, date, date);
        var demandWithOne = withOne["days"]![0]!["demand_score"]!.GetValue<int>();

        Assert.True(demandWithOne < demandWithTwo, "drugi ingest powinien nadpisać dobę, nie dopisać do niej");
    }
}
