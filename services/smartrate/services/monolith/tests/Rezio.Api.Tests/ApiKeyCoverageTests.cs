using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Rezio.Api.Tests;

/// <summary>
/// Wartownik klucza na CAŁYM /v1 — sprawdzany przez przejście po realnej
/// tablicy tras, a nie po liście spisanej ręcznie.
///
/// Pozostałe testy nie ustawiają SMARTRATE_API_KEY, więc filtr przepuszcza
/// i nie widzą, czy w ogóle jest wpięty. Tak właśnie /v1/internal/market-stats
/// i /v1/internal/events stały otworem: dopisanie trasy bez `.RequireApiKey()`
/// nie ruszało żadnego testu. Te wejścia przyjmują obłożenie rynku i wydarzenia,
/// czyli dane, z których liczy się REKOMENDOWANA CENA — otwarte pozwalają
/// podmienić ceny wszystkim obiektom w danym rynku.
/// </summary>
public class ApiKeyCoverageTests
{
    private const string Key = "sekret-testowy";

    private static WebApplicationFactory<Program> Factory() =>
        new WebApplicationFactory<Program>()
            .WithWebHostBuilder(b => b.UseSetting("SMARTRATE_API_KEY", Key));

    /// <summary>Wzorce tras z parametrami podstawionymi na wartości przykładowe.</summary>
    private static IEnumerable<(string Method, string Path)> V1Routes(
        WebApplicationFactory<Program> factory)
    {
        var source = factory.Services.GetRequiredService<EndpointDataSource>();
        foreach (var endpoint in source.Endpoints.OfType<RouteEndpoint>())
        {
            var raw = endpoint.RoutePattern.RawText ?? "";
            if (!raw.StartsWith("/v1/", StringComparison.Ordinal)) continue;

            var methods = endpoint.Metadata
                .GetMetadata<Microsoft.AspNetCore.Routing.IHttpMethodMetadata>()?.HttpMethods
                ?? ["GET"];
            var path = Regex.Replace(raw, @"\{[^}]+\}", "mkt_gdansk");
            foreach (var method in methods)
                yield return (method, path);
        }
    }

    [Fact]
    public void Sweep_ma_co_sprawdzac()
    {
        // literówka w filtrze ścieżek dałaby pustą listę i zielony test niżej
        using var factory = Factory();

        Assert.True(V1Routes(factory).Count() >= 10);
    }

    [Fact]
    public async Task Zadna_trasa_v1_nie_przechodzi_bez_klucza()
    {
        // Sprawdzamy BRAK powodzenia, nie konkretny kod: filtr biegnie po
        // wiązaniu argumentów, więc żądanie bez sensownego ciała bywa odrzucone
        // wcześniej jako 400. Dla bezpieczeństwa liczy się jedno — nie weszło.
        using var factory = Factory();
        var client = factory.CreateClient();

        var przepuszczone = new List<string>();
        foreach (var (method, path) in V1Routes(factory))
        {
            using var req = new HttpRequestMessage(new HttpMethod(method), path);
            if (method is "POST" or "PUT")
                req.Content = JsonContent.Create(new { });
            using var resp = await client.SendAsync(req);
            if (resp.IsSuccessStatusCode) przepuszczone.Add($"{method} {path}");
        }

        Assert.Empty(przepuszczone);
    }

    [Fact]
    public async Task Wstrzykniecie_statystyk_rynku_wymaga_klucza()
    {
        // najgroźniejsza z otwartych tras: obłożenie rynku wprost przelicza się
        // na rekomendowaną cenę każdego obiektu korzystającego z tego rynku
        using var factory = Factory();
        var client = factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/v1/internal/market-stats", new
        {
            market_id = "mkt_gdansk",
            stats = new[]
            {
                new { date = "2026-08-01", median_price = 400m, occupancy_rate = 0.99, active_listings = 10 },
            },
        });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Wstrzykniecie_wydarzen_wymaga_klucza()
    {
        // wymyślone wydarzenie podbija popyt, a więc i cenę — ta sama klasa
        using var factory = Factory();
        var client = factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/v1/internal/events", new
        {
            market_id = "mkt_gdansk",
            events = new[] { new { name = "Zmyślony koncert", date = "2026-08-01", weight = 1.0 } },
        });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Z_kluczem_wstrzykniecie_statystyk_przechodzi()
    {
        // przeciwwaga: wartownik nie może blokować własnego scrapera
        using var factory = Factory();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Api-Key", Key);

        var resp = await client.PostAsJsonAsync("/v1/internal/market-stats", new
        {
            market_id = "mkt_gdansk",
            stats = new[]
            {
                new { date = "2026-08-01", median_price = 400m, occupancy_rate = 0.80, active_listings = 10 },
            },
        });

        Assert.True(resp.IsSuccessStatusCode, $"otrzymano {(int)resp.StatusCode}");
    }

    [Fact]
    public async Task Bez_skonfigurowanego_klucza_wszystko_zostaje_otwarte()
    {
        // wdrożenie w sieci prywatnej i wbudowany panel w przeglądarce nie mają
        // gdzie trzymać sekretu; to świadomy kompromis opisany w ApiKeyFilter
        using var factory = new WebApplicationFactory<Program>();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/v1/markets")).StatusCode);
    }
}
