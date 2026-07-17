namespace Rezio.Api.Persistence;

public sealed class MarketDataRecord
{
    public required string MarketId { get; set; }
    public DateOnly Date { get; set; }
    public double? OccupancyRate { get; set; }
    public int? DemandScore { get; set; }
    public string DemandDriversJson { get; set; } = "[]";
    public DateTimeOffset LastWrittenAt { get; set; }
}
