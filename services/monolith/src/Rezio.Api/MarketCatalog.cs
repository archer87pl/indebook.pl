using System.Text.Json;
using Rezio.Demand.Domain;

namespace Rezio.Api;

public sealed record MarketRecord(string Id, string Name, MarketType Type, Voivodeship Voivodeship, double Lat, double Lng);

public sealed class MarketCatalog : IMarketRegistry
{
    private readonly IReadOnlyList<MarketRecord> _records;
    private readonly IReadOnlyDictionary<string, Market> _byId;

    public MarketCatalog(string? path = null)
    {
        path ??= Path.Combine(AppContext.BaseDirectory, "Data", "markets.json");
        var json = File.ReadAllText(path);
        var seeds = JsonSerializer.Deserialize<List<Seed>>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        _records = seeds.Select(s => new MarketRecord(
            s.Id, s.Name, Enum.Parse<MarketType>(s.Type), Enum.Parse<Voivodeship>(s.Voivodeship), s.Lat, s.Lng)).ToList();
        _byId = _records.ToDictionary(r => r.Id, r => new Market(r.Id, r.Name, r.Type, r.Voivodeship));
    }

    public IReadOnlyList<MarketRecord> Records => _records;
    public Market? Find(string marketId) => _byId.GetValueOrDefault(marketId);
    public IReadOnlyList<Market> All() => _byId.Values.ToList();

    private sealed record Seed(string Id, string Name, string Type, string Voivodeship, double Lat, double Lng);
}
