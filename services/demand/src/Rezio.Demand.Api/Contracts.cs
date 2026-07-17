using Rezio.Demand.Domain;

namespace Rezio.Demand.Api;

public sealed record DemandResponse(string MarketId, IReadOnlyList<DemandScore> Scores);
public sealed record PublishDemandRequest(DateOnly From, DateOnly To);
public sealed record PublishDemandResponse(int PublishedDays);
