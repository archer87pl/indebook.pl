using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.Contracts;
using Rezio.Pricing.Domain;

namespace Rezio.Api.Tests;

public class PricePublisherTests
{
    [Fact]
    public async Task Publishes_price_computed_with_rate_lines_for_known_listing()
    {
        await using var provider = new ServiceCollection()
            .AddSingleton(TimeProvider.System)
            .AddSingleton<IMarketDataStore>(sp =>
                new InMemoryMarketDataStore(sp.GetRequiredService<TimeProvider>()))
            .AddSingleton<IListingStore, InMemoryListingStore>()
            .AddScoped<PricePublisher>()
            .AddMassTransitTestHarness()
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var publisher = scope.ServiceProvider.GetRequiredService<PricePublisher>();

            var from = new DateOnly(2026, 8, 1);
            var to = new DateOnly(2026, 8, 3);
            var days = await publisher.PublishAsync("lst_demo", "con_beds24_1", "beds24-listing-1",
                from, to, today: new DateOnly(2026, 7, 20), CancellationToken.None);

            Assert.Equal(3, days);
            Assert.True(await harness.Published.Any<PriceComputed>());

            var published = harness.Published.Select<PriceComputed>().First().Context.Message!;
            Assert.Equal("lst_demo", published.ListingId);
            Assert.Equal("con_beds24_1", published.ConnectionId);
            Assert.Equal("PLN", published.Currency);
            Assert.Equal(3, published.Rates.Count);
            Assert.All(published.Rates, r => Assert.True(r.Price > 0));
        }
        finally
        {
            await harness.Stop();
        }
    }

    [Fact]
    public async Task Unknown_listing_publishes_nothing()
    {
        await using var provider = new ServiceCollection()
            .AddSingleton(TimeProvider.System)
            .AddSingleton<IMarketDataStore>(sp =>
                new InMemoryMarketDataStore(sp.GetRequiredService<TimeProvider>()))
            .AddSingleton<IListingStore, InMemoryListingStore>()
            .AddScoped<PricePublisher>()
            .AddMassTransitTestHarness()
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            using var scope = provider.CreateScope();
            var publisher = scope.ServiceProvider.GetRequiredService<PricePublisher>();
            var days = await publisher.PublishAsync("lst_nope", "con_beds24_1", "ext-1",
                new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 3), new DateOnly(2026, 7, 20), CancellationToken.None);

            Assert.Equal(0, days);
            Assert.False(await harness.Published.Any<PriceComputed>());
        }
        finally
        {
            await harness.Stop();
        }
    }
}
