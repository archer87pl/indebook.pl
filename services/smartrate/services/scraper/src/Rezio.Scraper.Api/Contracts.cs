using Rezio.Scraper.Domain;

namespace Rezio.Scraper.Api;

public sealed record ScrapeJobRequest(string MarketId, DateOnly From, DateOnly To);

public sealed record StatsResponse(string MarketId, IReadOnlyList<MarketDailyStats> Stats);
