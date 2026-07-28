using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class BackoffPolicyTests
{
    [Fact]
    public void Single_attempt_has_no_delays()
    {
        Assert.Empty(BackoffPolicy.Delays(1));
    }

    [Fact]
    public void Delays_are_exponential_seconds()
    {
        var delays = BackoffPolicy.Delays(4);
        Assert.Equal(3, delays.Count);
        Assert.Equal(TimeSpan.FromSeconds(1), delays[0]);
        Assert.Equal(TimeSpan.FromSeconds(2), delays[1]);
        Assert.Equal(TimeSpan.FromSeconds(4), delays[2]);
    }

    [Fact]
    public void Delays_are_capped_at_thirty_seconds()
    {
        var delays = BackoffPolicy.Delays(10);
        Assert.All(delays, d => Assert.True(d <= TimeSpan.FromSeconds(30)));
        Assert.Equal(TimeSpan.FromSeconds(30), delays[^1]);
    }
}
