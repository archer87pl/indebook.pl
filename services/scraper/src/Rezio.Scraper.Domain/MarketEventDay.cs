namespace Rezio.Scraper.Domain;

/// <summary>Skala w formie tekstowej — kontrakt z monolitem idzie JSON-em.</summary>
public sealed record EventLine(string Name, string Scale);

public sealed record MarketEventDay(DateOnly Date, IReadOnlyList<EventLine> Events);
