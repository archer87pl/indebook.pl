namespace Rezio.Scraper.Domain;

/// <summary>Rynek z pozycją — źródła wydarzeń filtrują geograficznie, nie po id.</summary>
public sealed record MarketGeo(string MarketId, double Lat, double Lng);

/// <summary>Wydarzenie tak, jak zwróciło je źródło, przed agregacją.</summary>
public sealed record SourceEvent(string ExternalRef, string Name, DateOnly Date, string Segment);

public interface IEventSource
{
    Task<IReadOnlyList<SourceEvent>> GetEventsAsync(
        MarketGeo market, DateOnly from, DateOnly to, CancellationToken ct);
}
