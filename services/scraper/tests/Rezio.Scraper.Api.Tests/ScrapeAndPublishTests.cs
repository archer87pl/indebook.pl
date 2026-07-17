using System.Net;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api.Tests;

internal sealed class RecordingHandler : HttpMessageHandler
{
    public List<(HttpRequestMessage Request, string Body)> Requests { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
        Requests.Add((request, body));
        return new HttpResponseMessage(HttpStatusCode.Accepted);
    }
}

internal sealed class ThrowingHandler : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
        throw new HttpRequestException("connection refused");
}

internal sealed class ServerErrorHandler : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
        Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError));
}

public class ScrapeAndPublishTests
{
    private static (ScrapeAndPublish Sut, RecordingHandler Handler) Build()
    {
        var store = new InMemoryStatsStore();
        var handler = new RecordingHandler();
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://monolith.test") };
        var sut = new ScrapeAndPublish(
            new ScrapeRunner(new SyntheticListingSource(), store),
            store,
            http,
            NullLogger<ScrapeAndPublish>.Instance);
        return (sut, handler);
    }

    private static ScrapeAndPublish BuildWithHandler(HttpMessageHandler handler)
    {
        var store = new InMemoryStatsStore();
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://monolith.test") };
        return new ScrapeAndPublish(
            new ScrapeRunner(new SyntheticListingSource(), store),
            store,
            http,
            NullLogger<ScrapeAndPublish>.Instance);
    }

    [Fact]
    public async Task Posts_market_stats_to_monolith_after_successful_scrape()
    {
        var (sut, handler) = Build();

        var result = await sut.RunAsync("mkt_gdansk",
            new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 10), CancellationToken.None);

        Assert.Equal(7, result.DaysAggregated);
        Assert.Single(handler.Requests);

        var (request, body) = handler.Requests[0];
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("/v1/internal/market-stats", request.RequestUri!.AbsolutePath);

        var json = JsonNode.Parse(body)!;
        Assert.Equal("mkt_gdansk", (string)json["market_id"]!);
        var stats = json["stats"]!.AsArray();
        Assert.Equal(7, stats.Count);
        Assert.All(stats, s => Assert.InRange((double)s!["occupancy_rate"]!, 0.0, 1.0));
        Assert.All(stats, s => Assert.True((decimal)s!["median_price"]! > 0));
    }

    [Fact]
    public async Task Unknown_market_posts_nothing()
    {
        var (sut, handler) = Build();

        var result = await sut.RunAsync("mkt_nope",
            new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 10), CancellationToken.None);

        Assert.Equal(0, result.DaysAggregated);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Scrape_result_returned_when_monolith_is_unreachable()
    {
        var sut = BuildWithHandler(new ThrowingHandler());

        var result = await sut.RunAsync("mkt_gdansk",
            new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 10), CancellationToken.None);

        Assert.Equal(30, result.ListingsScraped);
        Assert.Equal(7, result.DaysAggregated);
    }

    [Fact]
    public async Task Scrape_result_returned_when_monolith_responds_with_error_status()
    {
        var sut = BuildWithHandler(new ServerErrorHandler());

        var result = await sut.RunAsync("mkt_gdansk",
            new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 10), CancellationToken.None);

        Assert.Equal(30, result.ListingsScraped);
        Assert.Equal(7, result.DaysAggregated);
    }
}
