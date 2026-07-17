using System.Text.Json;
using HealthChecks.UI.Client;
using MassTransit;
using Rezio.Demand.Api;
using Rezio.Demand.Domain;
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
            labels: [new LokiLabel { Key = "service", Value = "demand-api" }]);
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton<IMarketRegistry, InMemoryMarketRegistry>();
builder.Services.AddScoped<DemandPublisher>();
builder.Services.AddMassTransit(x =>
{
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

app.MapPost("/v1/markets/{id}/publish-demand",
    async (string id, PublishDemandRequest request, DemandPublisher publisher, CancellationToken ct) =>
{
    if (request.To < request.From || request.To.DayNumber - request.From.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var days = await publisher.PublishAsync(id, request.From, request.To, ct);
    return days == 0
        ? Results.Problem(statusCode: 404, title: "Market not found")
        : Results.Accepted($"/v1/markets/{id}/demand", new PublishDemandResponse(days));
});

app.Run();

public partial class Program;
