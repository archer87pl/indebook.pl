namespace Rezio.Contracts;

public sealed record DemandScoreLine(DateOnly Date, int Score, IReadOnlyList<string> Drivers);

public sealed record DemandScoreUpdated(string MarketId, IReadOnlyList<DemandScoreLine> Scores);
