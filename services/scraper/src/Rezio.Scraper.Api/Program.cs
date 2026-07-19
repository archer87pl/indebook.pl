using System.Text.Json;
using HealthChecks.UI.Client;
using Rezio.Scraper.Api;
using Rezio.Scraper.Domain;
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
            labels: [new LokiLabel { Key = "service", Value = "scraper-api" }]);
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddSingleton<IListingSource, SyntheticListingSource>();
builder.Services.AddSingleton<IStatsStore, InMemoryStatsStore>();
builder.Services.AddSingleton<ScrapeRunner>();
builder.Services.AddHttpClient<ScrapeAndPublish>(client =>
{
    var monolithUrl = builder.Configuration["MONOLITH_URL"] ?? "http://localhost:8080";
    client.BaseAddress = new Uri(monolithUrl);
});

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

IResult? ValidateRange(DateOnly from, DateOnly to) =>
    to < from || to.DayNumber - from.DayNumber >= 365
        ? Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.")
        : null;

app.MapPost("/v1/scrape-jobs", async (ScrapeJobRequest request, ScrapeAndPublish runner, CancellationToken ct) =>
{
    if (ValidateRange(request.From, request.To) is { } invalid)
        return invalid;

    var result = await runner.RunAsync(request.MarketId, request.From, request.To, ct);
    return Results.Ok(result);
});

app.MapGet("/v1/markets/{id}/stats", (string id, DateOnly from, DateOnly to, IStatsStore store) =>
{
    if (ValidateRange(from, to) is { } invalid)
        return invalid;

    return Results.Ok(new StatsResponse(id, store.Get(id, from, to)));
});

app.Run();

public partial class Program;
