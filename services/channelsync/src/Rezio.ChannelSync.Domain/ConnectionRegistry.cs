using System.Collections.Concurrent;

namespace Rezio.ChannelSync.Domain;

public sealed record Connection(string Id, ChannelProvider Provider, string Status);

public sealed class ConnectionRegistry
{
    private readonly ConcurrentDictionary<string, Connection> _connections = new();
    private readonly ConcurrentDictionary<ChannelProvider, int> _counters = new();

    public Connection Add(ChannelProvider provider)
    {
        var n = _counters.AddOrUpdate(provider, 1, (_, current) => current + 1);
        var id = $"con_{provider.ToString().ToLowerInvariant()}_{n}";
        var connection = new Connection(id, provider, "connected");
        _connections[id] = connection;
        return connection;
    }

    public Connection? Find(string id) => _connections.GetValueOrDefault(id);

    public IReadOnlyList<Connection> All() => _connections.Values.ToList();
}
