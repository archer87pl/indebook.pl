namespace Rezio.ChannelSync.Domain;

public static class BackoffPolicy
{
    private static readonly TimeSpan Cap = TimeSpan.FromSeconds(30);

    public static IReadOnlyList<TimeSpan> Delays(int maxAttempts)
    {
        var delays = new List<TimeSpan>();
        for (var k = 0; k < maxAttempts - 1; k++)
        {
            var seconds = Math.Min(Math.Pow(2, k), Cap.TotalSeconds);
            delays.Add(TimeSpan.FromSeconds(seconds));
        }
        return delays;
    }
}
