using MassTransit;
using MassTransit.Testing;
using Microsoft.Extensions.DependencyInjection;
using Rezio.ChannelSync.Domain;
using Rezio.Contracts;

namespace Rezio.ChannelSync.Api.Tests;

public class PriceComputedConsumerTests
{
    // Fabryka zwracająca współdzielony adapter, żeby test mógł odczytać LastPushedRates.
    private sealed class CapturingAdapterFactory(SyntheticChannelAdapter adapter) : IAdapterFactory
    {
        public IChannelAdapter For(ChannelProvider provider) => adapter;
    }

    [Fact]
    public async Task Consumes_price_computed_and_pushes_rates_for_known_connection()
    {
        var registry = new ConnectionRegistry();
        var connection = registry.Add(ChannelProvider.Beds24); // con_beds24_1
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Beds24);

        await using var provider = new ServiceCollection()
            .AddSingleton(registry)
            .AddSingleton<SyncRunner>()
            .AddSingleton<IAdapterFactory>(new CapturingAdapterFactory(adapter))
            .AddSingleton(new RatePushService((_, _) => Task.CompletedTask))
            .AddMassTransitTestHarness(x => x.AddConsumer<PriceComputedConsumer>())
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            await harness.Bus.Publish(new PriceComputed(
                ListingId: "lst_demo",
                ConnectionId: connection.Id,
                ExternalListingId: "beds24-listing-1",
                Currency: "PLN",
                From: new DateOnly(2026, 8, 1),
                To: new DateOnly(2026, 8, 2),
                Rates: [new RateLine(new DateOnly(2026, 8, 1), 350m), new RateLine(new DateOnly(2026, 8, 2), 380m)]));

            Assert.True(await harness.Consumed.Any<PriceComputed>());
            Assert.NotNull(adapter.LastPushedRates);
            Assert.Equal(2, adapter.LastPushedRates!.Count);
            Assert.Equal(350m, adapter.LastPushedRates[0].Price);
        }
        finally
        {
            await harness.Stop();
        }
    }

    [Fact]
    public async Task Unknown_connection_consumes_but_pushes_nothing()
    {
        var registry = new ConnectionRegistry(); // pusty — brak con_beds24_1
        var adapter = new SyntheticChannelAdapter(ChannelProvider.Beds24);

        await using var provider = new ServiceCollection()
            .AddSingleton(registry)
            .AddSingleton<SyncRunner>()
            .AddSingleton<IAdapterFactory>(new CapturingAdapterFactory(adapter))
            .AddSingleton(new RatePushService((_, _) => Task.CompletedTask))
            .AddMassTransitTestHarness(x => x.AddConsumer<PriceComputedConsumer>())
            .BuildServiceProvider(true);

        var harness = provider.GetRequiredService<ITestHarness>();
        await harness.Start();
        try
        {
            await harness.Bus.Publish(new PriceComputed(
                "lst_demo", "con_nope_9", "ext-1", "PLN",
                new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 2),
                [new RateLine(new DateOnly(2026, 8, 1), 350m), new RateLine(new DateOnly(2026, 8, 2), 380m)]));

            Assert.True(await harness.Consumed.Any<PriceComputed>());
            Assert.Null(adapter.LastPushedRates);
        }
        finally
        {
            await harness.Stop();
        }
    }
}
