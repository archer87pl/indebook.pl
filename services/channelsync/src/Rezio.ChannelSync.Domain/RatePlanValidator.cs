namespace Rezio.ChannelSync.Domain;

public sealed record RatePlanValidation(bool IsValid, string? Error);

public static class RatePlanValidator
{
    public static RatePlanValidation Validate(IReadOnlyList<RateUpdate> rates, DateOnly from, DateOnly to)
    {
        if (rates is null || rates.Count == 0)
            return new RatePlanValidation(false, "empty rate plan");

        if (rates.Any(r => r.Price <= 0))
            return new RatePlanValidation(false, "non-positive price");

        if (rates.Any(r => r.Date < from || r.Date > to))
            return new RatePlanValidation(false, "date out of range");

        var distinctDates = rates.Select(r => r.Date).ToHashSet();
        if (distinctDates.Count != rates.Count)
            return new RatePlanValidation(false, "duplicate date");

        var expectedDays = to.DayNumber - from.DayNumber + 1;
        if (rates.Count != expectedDays)
            return new RatePlanValidation(false, "incomplete calendar coverage");

        return new RatePlanValidation(true, null);
    }
}
