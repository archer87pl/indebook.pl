using System.Text.Json;
using HealthChecks.UI.Client;
using MassTransit;
using Rezio.ChannelSync.Api;
using Rezio.ChannelSync.Domain;
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
            labels: [new LokiLabel { Key = "service", Value = "channelsync-api" }]);
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton<ConnectionRegistry>();
builder.Services.AddSingleton<SyncRunner>();
builder.Services.AddSingleton<IAdapterFactory, SyntheticAdapterFactory>();
builder.Services.AddSingleton(new RatePushService((delay, ct) => Task.Delay(delay, ct)));
builder.Services.AddMassTransit(x =>
{
    x.AddConsumer<PriceComputedConsumer>();
    var rabbit = builder.Configuration["RABBITMQ_URL"];
    if (!string.IsNullOrWhiteSpace(rabbit))
        x.UsingRabbitMq((ctx, cfg) => { cfg.Host(new Uri(rabbit)); cfg.ConfigureEndpoints(ctx); });
    else
        x.UsingInMemory((ctx, cfg) => cfg.ConfigureEndpoints(ctx));
});

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
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
