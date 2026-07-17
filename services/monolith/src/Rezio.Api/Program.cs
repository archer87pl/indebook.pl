using System.Text.Json;
using HealthChecks.UI.Client;
using Microsoft.EntityFrameworkCore;
using Rezio.Api;
using Rezio.Api.Persistence;
using Rezio.ChannelSync.Domain;
using Rezio.Demand.Domain;
using Rezio.Pricing.Domain;
using Serilog;
using Serilog.Events;
using Serilog.Sinks.Grafana.Loki;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSerilog(lc =>
{
    lc.MinimumLevel.Information()
      .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
      .Enrich.FromLogContext()
      .WriteTo.Console();
    var lokiUrl = builder.Configuration["LOKI_URL"];
    if (!string.IsNullOrWhiteSpace(lokiUrl))
        lc.WriteTo.GrafanaLoki(lokiUrl,
            labels: [new LokiLabel { Key = "service", Value = "rezio-api" }]);
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton(TimeProvider.System);

var databaseUrl = builder.Configuration["DATABASE_URL"];
if (StoreSelection.UsesPostgres(databaseUrl))
{
    builder.Services.AddDbContext<PricingDbContext>(o => o.UseNpgsql(databaseUrl));
    builder.Services.AddScoped<IMarketDataStore, EfMarketDataStore>();
}
else
{
    builder.Services.AddSingleton<IMarketDataStore>(sp =>
        new InMemoryMarketDataStore(sp.GetRequiredService<TimeProvider>()));
}

builder.Services.AddScoped<IListingStore, InMemoryListingStore>();
builder.Services.AddSingleton<IMarketRegistry, InMemoryMarketRegistry>();
builder.Services.AddSingleton<ConnectionRegistry>();
builder.Services.AddSingleton<SyncRunner>();
builder.Services.AddSingleton<IAdapterFactory, SyntheticAdapterFactory>();
builder.Services.AddSingleton(new RatePushService((delay, ct) => Task.Delay(delay, ct)));
builder.Services.AddScoped<PricePusher>();

var app = builder.Build();

if (StoreSelection.UsesPostgres(databaseUrl))
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<PricingDbContext>().Database.Migrate();
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

app.MapGet("/v1/listings/{id}/prices",
    async (string id, DateOnly from, DateOnly to, IListingStore store, TimeProvider clock, CancellationToken ct) =>
{
    if (to < from || to.DayNumber - from.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var settings = store.FindSettings(id);
    if (settings is null)
        return Results.Problem(statusCode: 404, title: "Listing not found");

    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var prices = (await store.MarketDaysAsync(id, from, to, ct))
        .Select(day => PricingEngine.Recommend(settings, day, today))
        .ToList();

    return Results.Ok(new PricesResponse(id, "PLN", prices));
});

app.MapGet("/v1/markets/{id}/demand",
    (string id, DateOnly from, DateOnly to, IMarketRegistry registry) =>
{
    if (to < from || to.DayNumber - from.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var market = registry.Find(id);
    if (market is null)
        return Results.Problem(statusCode: 404, title: "Market not found");

    var scores = CalendarSignals.ForRange(from, to)
        .Select(signals => DemandScoreCalculator.Score(market.Type, market.Voivodeship, signals))
        .ToList();
    return Results.Ok(new DemandResponse(id, scores));
});

app.MapPost("/v1/listings/{id}/publish-prices",
    async (string id, PublishPricesRequest request, PricePusher pusher, TimeProvider clock, CancellationToken ct) =>
{
    if (request.To < request.From || request.To.DayNumber - request.From.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var days = await pusher.PushAsync(id, request.ConnectionId, request.ExternalListingId,
        request.From, request.To, today, ct);

    return days == 0
        ? Results.Problem(statusCode: 404, title: "Listing or connection not found")
        : Results.Accepted($"/v1/listings/{id}/prices", new PublishPricesResponse(days));
});

app.MapPost("/v1/internal/market-stats",
    async (MarketStatsIngestRequest request, IMarketDataStore store, CancellationToken ct) =>
{
    foreach (var line in request.Stats)
        await store.SetStatsAsync(request.MarketId, line.Date, line.OccupancyRate, ct);
    return Results.Accepted(value: new { ingested_days = request.Stats.Count });
});

app.MapPost("/v1/connections", (CreateConnectionRequest request, ConnectionRegistry registry) =>
{
    if (int.TryParse(request.Provider, out _) || !Enum.TryParse<ChannelProvider>(request.Provider, ignoreCase: true, out var provider) || !Enum.IsDefined(provider))
        return Results.Problem(statusCode: 400, title: "Unknown provider",
            detail: "provider must be one of: beds24, smoobu, hostaway.");

    var connection = registry.Add(provider);
    return Results.Created($"/v1/connections/{connection.Id}",
        new ConnectionResponse(connection.Id, connection.Provider.ToString().ToLowerInvariant(), connection.Status));
});

app.MapGet("/v1/connections/{id}", (string id, ConnectionRegistry registry) =>
{
    var connection = registry.Find(id);
    return connection is null
        ? Results.Problem(statusCode: 404, title: "Connection not found")
        : Results.Ok(new ConnectionResponse(id, connection.Provider.ToString().ToLowerInvariant(), connection.Status));
});

app.MapGet("/v1/connections/{id}/listings", async (string id, ConnectionRegistry registry, IAdapterFactory factory, CancellationToken ct) =>
{
    var connection = registry.Find(id);
    if (connection is null)
        return Results.Problem(statusCode: 404, title: "Connection not found");

    var adapter = factory.For(connection.Provider);
    var listings = await adapter.PullListingsAsync(ct);
    return Results.Ok(new ListingsResponse(id, listings));
});

app.MapPost("/v1/connections/{id}/sync", async (string id, SyncRequest request, ConnectionRegistry registry, SyncRunner runner, IAdapterFactory factory, CancellationToken ct) =>
{
    if (request.To < request.From || request.To.DayNumber - request.From.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var connection = registry.Find(id);
    if (connection is null)
        return Results.Problem(statusCode: 404, title: "Connection not found");

    var adapter = factory.For(connection.Provider);
    var result = await runner.SyncAsync(adapter, id, request.From, request.To, ct);
    return Results.Ok(result);
});

app.Run();

public partial class Program;
