using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.Contracts;
using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api.Tests;

public class ScrapeAndPublishTests
{
    private static ServiceProvider Build() => new ServiceCollection()
        .AddSingleton<IListingSource, SyntheticListingSource>()
        .AddSingleton<IStatsStore, InMemoryStatsStore>()
        .AddSingleton<ScrapeRunner>()
        .AddScoped<ScrapeAndPublish>()
        .AddMassTransitTestHarness()
        .BuildServiceProvider(true);

    [Fact]
    public async Task Publishes_market_stats_after_successful_scrape()
    {
        await using var provider = Build();
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var sut = scope.ServiceProvider.GetRequiredService<ScrapeAndPublish>();
            var result = await sut.RunAsync("mkt_gdansk",
                new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 10), CancellationToken.None);

            Assert.Equal(7, result.DaysAggregated);
            Assert.True(await harness.Published.Any<MarketStatsUpdated>());

            var evt = harness.Published.Select<MarketStatsUpdated>().First().Context.Message;
            Assert.Equal("mkt_gdansk", evt.MarketId);
            Assert.Equal(7, evt.Stats.Count);
            Assert.All(evt.Stats, s => Assert.InRange(s.OccupancyRate, 0.0, 1.0));
            Assert.All(evt.Stats, s => Assert.True(s.MedianPrice > 0));
        }
        finally { await harness.Stop(); }
    }

    [Fact]
    public async Task Unknown_market_publishes_nothing()
    {
        await using var provider = Build();
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var sut = scope.ServiceProvider.GetRequiredService<ScrapeAndPublish>();
            var result = await sut.RunAsync("mkt_nope",
                new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 10), CancellationToken.None);

            Assert.Equal(0, result.DaysAggregated);
            Assert.False(await harness.Published.Any<MarketStatsUpdated>());
        }
        finally { await harness.Stop(); }
    }
}
