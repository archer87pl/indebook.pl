namespace Rezio.ChannelSync.Domain;

public abstract record PushOutcome
{
    public sealed record Success(int AttemptsUsed) : PushOutcome;
    public sealed record Failed(int AttemptsUsed, string LastError) : PushOutcome;
}

public sealed class RatePushService(Func<TimeSpan, CancellationToken, Task> delay)
{
    public async Task<PushOutcome> PushAsync(
        IChannelAdapter adapter,
        string externalListingId,
        IReadOnlyList<RateUpdate> rates,
        DateOnly from,
        DateOnly to,
        int maxAttempts,
        CancellationToken ct)
    {
        var validation = RatePlanValidator.Validate(rates, from, to);
        if (!validation.IsValid)
            return new PushOutcome.Failed(0, validation.Error!);

        var delays = BackoffPolicy.Delays(maxAttempts);
        string lastError = "";

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                await adapter.PushRatesAsync(externalListingId, rates, ct);
                return new PushOutcome.Success(attempt);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                lastError = ex.Message;
                if (attempt < maxAttempts)
                    await delay(delays[attempt - 1], ct);
            }
        }

        return new PushOutcome.Failed(maxAttempts, lastError);
    }
}
