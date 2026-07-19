using Rezio.ChannelSync.Domain;
using Rezio.Pricing.Domain;

namespace Rezio.Api;

public sealed record PricesResponse(
    string ListingId,
    string Currency,
    IReadOnlyList<PriceRecommendation> Prices);

public sealed record PublishPricesRequest(string ConnectionId, string ExternalListingId, DateOnly From, DateOnly To);
public sealed record PublishPricesResponse(int PublishedDays);

public sealed record DemandResponse(string MarketId, IReadOnlyList<Rezio.Demand.Domain.DemandScore> Scores);

public sealed record CreateConnectionRequest(string Provider);

public sealed record ConnectionResponse(string Id, string Provider, string Status);

public sealed record ListingsResponse(string ConnectionId, IReadOnlyList<ChannelListing> Listings);

public sealed record SyncRequest(DateOnly From, DateOnly To);

public sealed record MarketStatsIngestLine(DateOnly Date, decimal MedianPrice, double OccupancyRate, int ActiveListings);
public sealed record MarketStatsIngestRequest(string MarketId, IReadOnlyList<MarketStatsIngestLine> Stats);

public sealed record QuoteRequest(string MarketId, decimal BasePrice, decimal MinPrice, decimal MaxPrice, DateOnly From, DateOnly To);
public sealed record QuoteResponse(string MarketId, string MarketName, string MarketType, string Currency, IReadOnlyList<QuoteDay> Days);

public sealed record MarketDto(string Id, string Name, string Type, string Voivodeship, double Lat, double Lng);
public sealed record MarketsResponse(IReadOnlyList<MarketDto> Markets);
