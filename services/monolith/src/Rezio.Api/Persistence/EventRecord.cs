namespace Rezio.Api.Persistence;

/// <summary>
/// Wydarzenia rynku w jednej dobie. Osobna tabela, nie kolumna w market_data:
/// źródła są niezależne (scraper ofert kontra API wydarzeń), mają inne okno
/// świeżości i nie powinny konkurować o ten sam wiersz przy zapisie.
/// </summary>
public sealed class EventRecord
{
    public required string MarketId { get; set; }
    public DateOnly Date { get; set; }
    public string EventsJson { get; set; } = "[]";
    public DateTimeOffset LastWrittenAt { get; set; }
}
