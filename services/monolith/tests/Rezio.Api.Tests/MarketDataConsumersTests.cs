using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.Contracts;
using Rezio.Api;

namespace Rezio.Api.Tests;

public class MarketDataConsumersTests
{
    [Fact]
    public async Task Consumes_market_stats_into_store()
    {
        var store = new InMemoryMarketDataStore(TimeProvider.System);
        await using var provider = new ServiceCollection()
            .AddSingleton<IMarketDataStore>(store)
            .AddMassTransitTestHarness(x => x.AddConsumer<MarketStatsUpdatedConsumer>())
            .BuildServiceProvider(true);
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            await harness.Bus.Publish(new MarketStatsUpdated("mkt_gdansk",
                [new MarketStatsLine(new DateOnly(2026, 6, 4), 320m, 0.85, 30)]));

            Assert.True(await harness.Consumed.Any<MarketStatsUpdated>());
            Assert.Equal(0.85, (await store.GetAsync("mkt_gdansk", new DateOnly(2026, 6, 4), CancellationToken.None)).OccupancyRate);
        }
        finally { await harness.Stop(); }
    }

    [Fact]
    public async Task Consumes_demand_scores_into_store()
    {
        var store = new InMemoryMarketDataStore(TimeProvider.System);
        await using var provider = new ServiceCollection()
            .AddSingleton<IMarketDataStore>(store)
            .AddMassTransitTestHarness(x => x.AddConsumer<DemandScoreUpdatedConsumer>())
            .BuildServiceProvider(true);
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            await harness.Bus.Publish(new DemandScoreUpdated("mkt_gdansk",
                [new DemandScoreLine(new DateOnly(2026, 6, 4), 70, ["Boże Ciało"])]));

            Assert.True(await harness.Consumed.Any<DemandScoreUpdated>());
            var data = await store.GetAsync("mkt_gdansk", new DateOnly(2026, 6, 4), CancellationToken.None);
            Assert.Equal(70, data.DemandScore);
            Assert.Contains("Boże Ciało", data.DemandDrivers);
        }
        finally { await harness.Stop(); }
    }
}
