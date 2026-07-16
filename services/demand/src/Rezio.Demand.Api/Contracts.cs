using Rezio.Demand.Domain;

namespace Rezio.Demand.Api;

public sealed record DemandResponse(string MarketId, IReadOnlyList<DemandScore> Scores);
