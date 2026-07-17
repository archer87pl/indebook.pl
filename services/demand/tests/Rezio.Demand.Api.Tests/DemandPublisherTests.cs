using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.Contracts;

namespace Rezio.Demand.Api.Tests;

public class DemandPublisherTests
{
    private static ServiceProvider Build() => new ServiceCollection()
        .AddSingleton<IMarketRegistry, InMemoryMarketRegistry>()
        .AddScoped<DemandPublisher>()
        .AddMassTransitTestHarness()
        .BuildServiceProvider(true);

    [Fact]
    public async Task Publishes_scores_with_holiday_drivers_for_known_market()
    {
        await using var provider = Build();
        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var sut = scope.ServiceProvider.GetRequiredService<DemandPublisher>();
            var days = await sut.PublishAsync("mkt_zakopane",
                new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 7), CancellationToken.None);

            Assert.Equal(4, days);
            Assert.True(await harness.Published.Any<DemandScoreUpdated>());

            var evt = harness.Published.Select<DemandScoreUpdated>().First().Context.Message;
            Assert.Equal("mkt_zakopane", evt.MarketId);
            Assert.Equal(4, evt.Scores.Count);
            Assert.Equal(75, evt.Scores[0].Score); // Boże Ciało w długi weekend, góry
            Assert.Contains("Boże Ciało", evt.Scores[0].Drivers);
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
            var sut = scope.ServiceProvider.GetRequiredService<DemandPublisher>();
            var days = await sut.PublishAsync("mkt_nope",
                new DateOnly(2026, 6, 4), new DateOnly(2026, 6, 7), CancellationToken.None);

            Assert.Equal(0, days);
            Assert.False(await harness.Published.Any<DemandScoreUpdated>());
        }
        finally { await harness.Stop(); }
    }
}
