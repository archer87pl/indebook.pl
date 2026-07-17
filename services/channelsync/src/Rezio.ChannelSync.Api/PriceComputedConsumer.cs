using MassTransit;
using Rezio.ChannelSync.Domain;
using Rezio.Contracts;

namespace Rezio.ChannelSync.Api;

public sealed class PriceComputedConsumer(
    ConnectionRegistry registry,
    IAdapterFactory factory,
    RatePushService pushService,
    ILogger<PriceComputedConsumer> logger) : IConsumer<PriceComputed>
{
    public async Task Consume(ConsumeContext<PriceComputed> context)
    {
        var msg = context.Message;
        var connection = registry.Find(msg.ConnectionId);
        if (connection is null)
        {
            logger.LogWarning("PriceComputed for unknown connection {ConnectionId} — skipping push", msg.ConnectionId);
            return;
        }

        var adapter = factory.For(connection.Provider);
        var rates = msg.Rates.Select(r => new RateUpdate(r.Date, r.Price)).ToList();

        var outcome = await pushService.PushAsync(
            adapter, msg.ExternalListingId, rates, msg.From, msg.To, maxAttempts: 3, context.CancellationToken);

        switch (outcome)
        {
            case PushOutcome.Success success:
                logger.LogInformation("Pushed {Count} rates to {ExternalListingId} in {Attempts} attempt(s)",
                    rates.Count, msg.ExternalListingId, success.AttemptsUsed);
                break;
            case PushOutcome.Failed failed:
                logger.LogError("Rate push to {ExternalListingId} failed after {Attempts} attempt(s): {Error}",
                    msg.ExternalListingId, failed.AttemptsUsed, failed.LastError);
                break;
        }
    }
}
