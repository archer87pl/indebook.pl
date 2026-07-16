using System.Text.Json;
using HealthChecks.UI.Client;
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

app.Run();

public partial class Program;
