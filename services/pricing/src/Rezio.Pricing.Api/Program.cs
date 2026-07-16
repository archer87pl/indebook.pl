using System.Text.Json;
using HealthChecks.UI.Client;
using Rezio.Pricing.Api;
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
builder.Services.AddSingleton<IListingStore, InMemoryListingStore>();

var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

app.MapGet("/v1/listings/{id}/prices",
    (string id, DateOnly from, DateOnly to, IListingStore store, TimeProvider clock) =>
{
    if (to < from || to.DayNumber - from.DayNumber >= 365)
        return Results.Problem(statusCode: 400, title: "Invalid date range",
            detail: "'to' must not precede 'from' and the range must not exceed 365 days.");

    var settings = store.FindSettings(id);
    if (settings is null)
        return Results.Problem(statusCode: 404, title: "Listing not found");

    var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    var prices = store.MarketDays(id, from, to)
        .Select(day => PricingEngine.Recommend(settings, day, today))
        .ToList();

    return Results.Ok(new PricesResponse(id, "PLN", prices));
});

app.Run();

public partial class Program;
