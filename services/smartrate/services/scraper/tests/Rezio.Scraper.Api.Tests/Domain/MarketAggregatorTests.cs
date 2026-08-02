using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Domain.Tests;

public class MarketAggregatorTests
{
    private static ListingDayObservation Obs(string @ref, string date, decimal price, bool available) =>
        new(@ref, DateOnly.Parse(date), price, available);

    [Fact]
    public void Median_of_odd_count_available_prices()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-01", 100m, true),
            Obs("b", "2026-08-01", 300m, true),
            Obs("c", "2026-08-01", 200m, true),
        ]).Single();

        Assert.Equal(200m, stats.MedianPrice);
        Assert.Equal(0.0, stats.OccupancyRate);
        Assert.Equal(3, stats.ActiveListings);
    }

    [Fact]
    public void Median_of_even_count_is_average_of_middle_two()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-01", 100m, true),
            Obs("b", "2026-08-01", 200m, true),
            Obs("c", "2026-08-01", 300m, true),
            Obs("d", "2026-08-01", 400m, true),
        ]).Single();

        Assert.Equal(250m, stats.MedianPrice);
    }

    [Fact]
    public void Occupancy_counts_unavailable_share_and_median_uses_available_only()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-01", 100m, true),
            Obs("b", "2026-08-01", 200m, true),
            Obs("c", "2026-08-01", 999m, false),
        ]).Single();

        Assert.Equal(150m, stats.MedianPrice);              // mediana tylko z dostępnych
        Assert.Equal(1.0 / 3, stats.OccupancyRate, precision: 10);
        Assert.Equal(3, stats.ActiveListings);
    }

    [Fact]
    public void All_booked_falls_back_to_median_of_all_prices()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-01", 100m, false),
            Obs("b", "2026-08-01", 300m, false),
        ]).Single();

        Assert.Equal(200m, stats.MedianPrice);
        Assert.Equal(1.0, stats.OccupancyRate);
    }

    [Fact]
    public void Groups_by_date_and_sorts_ascending()
    {
        var stats = MarketAggregator.Aggregate(
        [
            Obs("a", "2026-08-02", 200m, true),
            Obs("a", "2026-08-01", 100m, true),
        ]);

        Assert.Equal(2, stats.Count);
        Assert.Equal(DateOnly.Parse("2026-08-01"), stats[0].Date);
        Assert.Equal(100m, stats[0].MedianPrice);
        Assert.Equal(DateOnly.Parse("2026-08-02"), stats[1].Date);
    }

    [Fact]
    public void Empty_input_returns_empty_list()
    {
        Assert.Empty(MarketAggregator.Aggregate([]));
    }
}
