using Rezio.ChannelSync.Domain;

namespace Rezio.ChannelSync.Api;

public sealed record CreateConnectionRequest(string Provider);

public sealed record ConnectionResponse(string Id, string Provider, string Status);

public sealed record ListingsResponse(string ConnectionId, IReadOnlyList<ChannelListing> Listings);

public sealed record SyncRequest(DateOnly From, DateOnly To);
