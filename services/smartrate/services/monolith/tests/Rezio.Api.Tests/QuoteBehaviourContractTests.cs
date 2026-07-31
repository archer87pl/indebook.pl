using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Rezio.Api.Tests;

/// <summary>
/// Uzupełnienie <see cref="QuoteContractTests"/>. Tamten pilnuje KSZTAŁTU —
/// zestawu nazw pól, porównanego z contracts/smartrate-quote.json. Ten pilnuje
/// ZACHOWANIA prawdziwego endpointu: wartości, których RezFlow używa jako
/// słownika, oraz granic zakresu dat.
///
/// Rozdział jest celowy. Kształt da się sprawdzić serializując DTO, bez
/// stawiania aplikacji. Zachowania nie — a to właśnie ono potrafi się rozjechać
/// po cichu: klient TS czyta `clamped_by` przez startsWith("min")/("max")
/// Z UWZGLĘDNIENIEM WIELKOŚCI LITER, więc "MinPrice" przeszłoby przez test
/// kształtu (pole jest, typ się zgadza) i dopiero na produkcji panel
/// przestałby pokazywać obcięcie do widełek.
/// </summary>
public class QuoteBehaviourContractTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    private async Task<JsonNode> QuoteAsync(decimal minPrice = 280m, decimal maxPrice = 1200m)
    {
        var resp = await _client.PostAsJsonAsync("/v1/quote", new
        {
            market_id = "mkt_zakopane",
            base_price = 450m,
            min_price = minPrice,
            max_price = maxPrice,
            from = "2026-08-10",
            to = "2026-08-12",
        });
        resp.EnsureSuccessStatusCode();
        return JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
    }

    [Fact]
    public async Task Przyciecie_do_widelek_nazywa_sie_min_price_albo_max_price()
    {
        // słownik wartości, nie tylko obecność pola — patrz komentarz klasy
        var json = await QuoteAsync(minPrice: 900m);

        var clamped = json["days"]!.AsArray()
            .Select(d => (string?)d!["clamped_by"])
            .Where(v => v is not null)
            .ToList();

        Assert.NotEmpty(clamped);
        Assert.All(clamped, v => Assert.True(
            v!.StartsWith("min", StringComparison.Ordinal) || v.StartsWith("max", StringComparison.Ordinal),
            $"clamped_by = '{v}' — klient rozpoznaje tylko małe 'min'/'max'"));
    }

    [Fact]
    public async Task Brak_przyciecia_daje_null_a_nie_pusty_tekst()
    {
        // klient sprawdza `typeof d.clamped_by === "string"`; pusty tekst
        // przeszedłby jako „przycięte, ale nie wiadomo z której strony"
        var json = await QuoteAsync();

        foreach (var d in json["days"]!.AsArray())
        {
            var v = d!["clamped_by"];
            Assert.True(v is null || ((string)v!).Length > 0);
        }
    }

    [Fact]
    public async Task Zakres_dat_jest_obustronnie_domkniety()
    {
        // RezFlow wysyła `to` WŁĄCZNIE (QuoteInput.to to ostatnia doba pobytu).
        // Przejście na przedział półotwarty ucięłoby ostatnią noc z wyceny —
        // a suma nadal wyglądałaby sensownie, więc nikt by nie zauważył.
        var json = await QuoteAsync();
        var daty = json["days"]!.AsArray().Select(d => (string)d!["date"]!).ToList();

        Assert.Equal(new[] { "2026-08-10", "2026-08-11", "2026-08-12" }, daty);
    }

    [Fact]
    public async Task Markets_ma_pola_ktore_czyta_RezFlow()
    {
        // lib/rates/smartrate.ts: data.markets → r.id, r.name, r.type,
        // r.voivodeship. Kontrakt w contracts/ opisuje tylko /v1/quote,
        // więc lista rynków nie była niczym objęta.
        var resp = await _client.GetAsync("/v1/markets");
        resp.EnsureSuccessStatusCode();
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;

        Assert.NotNull(json["markets"]);
        var rynek = json["markets"]!.AsArray()[0]!;
        foreach (var pole in new[] { "id", "name", "type", "voivodeship" })
            Assert.True(rynek[pole] is not null, $"brak pola markets[].{pole}");
    }

    [Fact]
    public async Task Wojewodztwa_sa_niepuste_bo_grupuja_liste_w_panelu()
    {
        // puste województwo wrzuca wszystkie 89 rynków do jednej grupy
        // o pustej nazwie w liście wyboru w panelu cennika
        var resp = await _client.GetAsync("/v1/markets");
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;

        Assert.All(json["markets"]!.AsArray(),
            m => Assert.False(string.IsNullOrWhiteSpace((string?)m!["voivodeship"])));
    }

    [Fact]
    public async Task Blad_wraca_jako_problem_json_z_detail()
    {
        // klient wyciąga `problem.detail || problem.title` do komunikatu
        // w panelu właściciela; bez tych pól zobaczy gołe „SmartRate 400”
        var resp = await _client.PostAsJsonAsync("/v1/quote", new
        {
            market_id = "mkt_zakopane",
            base_price = 450m,
            min_price = 280m,
            max_price = 1200m,
            from = "2026-08-12",
            to = "2026-08-10", // odwrócony zakres
        });

        Assert.False(resp.IsSuccessStatusCode);
        Assert.Contains("application/problem+json", resp.Content.Headers.ContentType!.ToString());
        var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
        Assert.NotNull(json["title"]);
        Assert.NotNull(json["detail"]);
    }

    [Fact]
    public async Task Nieznany_rynek_to_404_a_nie_pusta_wycena()
    {
        // RezFlow zapisuje smartRateError i degraduje do cennika reguł;
        // pusta lista dób z kodem 200 wyglądałaby na „brak rekomendacji"
        // i zostawiła właściciela bez informacji, że rynek zniknął
        var resp = await _client.PostAsJsonAsync("/v1/quote", new
        {
            market_id = "mkt_nie_istnieje",
            base_price = 450m,
            min_price = 280m,
            max_price = 1200m,
            from = "2026-08-10",
            to = "2026-08-12",
        });

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }
}
