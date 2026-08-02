using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class RatePushServiceTests
{
    private static readonly DateOnly From = new(2026, 8, 1);
    private static readonly DateOnly To = new(2026, 8, 2);
    private static readonly IReadOnlyList<RateUpdate> ValidRates =
        [new(new DateOnly(2026, 8, 1), 300m), new(new DateOnly(2026, 8, 2), 320m)];

    // Adapter, który failuje pierwsze N wywołań push, potem sukces; liczy próby.
    private sealed class FlakyAdapter(int failuresBeforeSuccess) : IChannelAdapter
    {
        public int PushAttempts { get; private set; }
        public ChannelProvider Provider => ChannelProvider.Beds24;
        public Task<IReadOnlyList<ChannelListing>> PullListingsAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<ChannelListing>>([]);
        public Task<IReadOnlyList<Reservation>> PullReservationsAsync(DateOnly from, DateOnly to, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<Reservation>>([]);
        public Task PushRatesAsync(string externalListingId, IReadOnlyList<RateUpdate> rates, CancellationToken ct)
        {
            PushAttempts++;
            if (PushAttempts <= failuresBeforeSuccess)
                throw new InvalidOperationException($"channel error {PushAttempts}");
            return Task.CompletedTask;
        }
    }

    private static RatePushService NoDelayService() => new((_, _) => Task.CompletedTask);

    [Fact]
    public async Task Successful_push_on_first_attempt()
    {
        var adapter = new FlakyAdapter(0);
        var outcome = await NoDelayService().PushAsync(adapter, "ext-1", ValidRates, From, To, maxAttempts: 3, default);

        var success = Assert.IsType<PushOutcome.Success>(outcome);
        Assert.Equal(1, success.AttemptsUsed);
        Assert.Equal(1, adapter.PushAttempts);
    }

    [Fact]
    public async Task Retries_then_succeeds()
    {
        var adapter = new FlakyAdapter(2);
        var outcome = await NoDelayService().PushAsync(adapter, "ext-1", ValidRates, From, To, maxAttempts: 3, default);

        var success = Assert.IsType<PushOutcome.Success>(outcome);
        Assert.Equal(3, success.AttemptsUsed);
        Assert.Equal(3, adapter.PushAttempts);
    }

    [Fact]
    public async Task Exhausts_attempts_then_fails()
    {
        var adapter = new FlakyAdapter(99);
        var outcome = await NoDelayService().PushAsync(adapter, "ext-1", ValidRates, From, To, maxAttempts: 3, default);

        var failed = Assert.IsType<PushOutcome.Failed>(outcome);
        Assert.Equal(3, failed.AttemptsUsed);
        Assert.Equal(3, adapter.PushAttempts);
        Assert.Contains("channel error", failed.LastError);
    }

    [Fact]
    public async Task Invalid_plan_fails_without_calling_adapter()
    {
        var adapter = new FlakyAdapter(0);
        var partial = new[] { new RateUpdate(new DateOnly(2026, 8, 1), 300m) }; // brak 08-02
        var outcome = await NoDelayService().PushAsync(adapter, "ext-1", partial, From, To, maxAttempts: 3, default);

        var failed = Assert.IsType<PushOutcome.Failed>(outcome);
        Assert.Equal(0, failed.AttemptsUsed);
        Assert.Equal(0, adapter.PushAttempts);
        Assert.Equal("incomplete calendar coverage", failed.LastError);
    }
}
