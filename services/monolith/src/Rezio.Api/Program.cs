using System.Text.Json;
using HealthChecks.UI.Client;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Rezio.Api;
using Rezio.Api.Persistence;
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
            labels: [new LokiLabel { Key = "service", Value = "pricing-api" }]);
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

builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<MarketStatsUpdatedConsumer>();
    x.AddConsumer<DemandScoreUpdatedConsumer>();

    var rabbit = builder.Configuration["RABBITMQ_URL"];
    if (!string.IsNullOrWhiteSpace(rabbit))
        x.UsingRabbitMq((ctx, cfg) => { cfg.Host(new Uri(rabbit)); cfg.ConfigureEndpoints(ctx); });
    else
        x.UsingInMemory((ctx, cfg) => cfg.ConfigureEndpoints(ctx));
});
builder.Services.AddScoped<PricePublisher>();

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

app.MapPost("/v1/listings/{id}/publish-prices",
    async (string id, PublishPricesRequest request, PricePublisher publisher, TimeProvider clock, CancellationToken ct) =>
{
    if (request.To < request.From || request.To.DayNumber - request.From.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var days = await publisher.PublishAsync(id, request.ConnectionId, request.ExternalListingId,
        request.From, request.To, today, ct);

    return days == 0
        ? Results.Problem(statusCode: 404, title: "Listing not found")
        : Results.Accepted($"/v1/listings/{id}/prices", new PublishPricesResponse(days));
});

app.Run();

public partial class Program;
