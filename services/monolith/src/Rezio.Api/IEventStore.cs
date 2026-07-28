namespace Rezio.Api;

internal static class EventFreshness
{
    // Dłużej niż statystyki rynku (7 dni): kalendarz wydarzeń publikowany jest
    // z miesięcznym wyprzedzeniem i sprzed miesiąca wciąż jest w większości
    // prawdziwy, a odświeżamy go rzadziej niż obłożenie.
    public static readonly TimeSpan Window = TimeSpan.FromDays(30);
}

public sealed record MarketEvent(string Name, string Scale);

public interface IEventStore
{
    /// <summary>Zastępuje komplet wydarzeń rynku dla wskazanej doby.</summary>
    Task SetEventsAsync(string marketId, DateOnly date, IReadOnlyList<MarketEvent> events, CancellationToken ct);

    /// <summary>Wydarzenia doby; pusta lista, gdy brak danych albo są przeterminowane.</summary>
    Task<IReadOnlyList<MarketEvent>> GetAsync(string marketId, DateOnly date, CancellationToken ct);
}
