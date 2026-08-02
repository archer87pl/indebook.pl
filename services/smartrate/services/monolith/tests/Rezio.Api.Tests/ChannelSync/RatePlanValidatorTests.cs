using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Domain.Tests;

public class RatePlanValidatorTests
{
    private static readonly DateOnly From = new(2026, 8, 1);
    private static readonly DateOnly To = new(2026, 8, 3);

    private static RateUpdate R(int day, decimal price) => new(new DateOnly(2026, 8, day), price);

    [Fact]
    public void Full_contiguous_coverage_is_valid()
    {
        var result = RatePlanValidator.Validate([R(1, 300m), R(2, 320m), R(3, 310m)], From, To);
        Assert.True(result.IsValid);
        Assert.Null(result.Error);
    }

    [Fact]
    public void Unordered_but_complete_is_valid()
    {
        var result = RatePlanValidator.Validate([R(3, 310m), R(1, 300m), R(2, 320m)], From, To);
        Assert.True(result.IsValid);
    }

    [Fact]
    public void Empty_is_invalid()
    {
        var result = RatePlanValidator.Validate([], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("empty rate plan", result.Error);
    }

    [Fact]
    public void Missing_day_is_incomplete()
    {
        var result = RatePlanValidator.Validate([R(1, 300m), R(3, 310m)], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("incomplete calendar coverage", result.Error);
    }

    [Fact]
    public void Duplicate_day_is_rejected()
    {
        var result = RatePlanValidator.Validate([R(1, 300m), R(1, 320m), R(3, 310m)], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("duplicate date", result.Error);
    }

    [Fact]
    public void Date_out_of_range_is_rejected()
    {
        var result = RatePlanValidator.Validate([R(1, 300m), R(2, 320m), R(5, 310m)], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("date out of range", result.Error);
    }

    [Fact]
    public void Non_positive_price_is_rejected()
    {
        var result = RatePlanValidator.Validate([R(1, 0m), R(2, 320m), R(3, 310m)], From, To);
        Assert.False(result.IsValid);
        Assert.Equal("non-positive price", result.Error);
    }
}
