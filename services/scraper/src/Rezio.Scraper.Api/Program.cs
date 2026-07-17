using System.Text.Json;
using HealthChecks.UI.Client;
using MassTransit;
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
builder.Services.AddScoped<ScrapeAndPublish>();
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

string[] knownMarkets = ["mkt_zakopane", "mkt_gdansk", "mkt_krakow", "mkt_warszawa"];

IResult? ValidateRange(DateOnly from, DateOnly to) =>
    to < from || to.DayNumber - from.DayNumber >= 365
        ? Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.")
        : null;

app.MapPost("/v1/scrape-jobs", async (ScrapeJobRequest request, ScrapeAndPublish runner, CancellationToken ct) =>
{
    if (ValidateRange(request.From, request.To) is { } invalid)
        return invalid;

    if (!knownMarkets.Contains(request.MarketId))
        return Results.Problem(statusCode: 404, title: "Market not found");

    var result = await runner.RunAsync(request.MarketId, request.From, request.To, ct);
    return Results.Ok(result);
});

app.MapGet("/v1/markets/{id}/stats", (string id, DateOnly from, DateOnly to, IStatsStore store) =>
{
    if (ValidateRange(from, to) is { } invalid)
        return invalid;

    if (!knownMarkets.Contains(id))
        return Results.Problem(statusCode: 404, title: "Market not found");

    return Results.Ok(new StatsResponse(id, store.Get(id, from, to)));
});

app.Run();

public partial class Program;
