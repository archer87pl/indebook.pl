using System.Text.Json;
using System.Text.Json.Nodes;

namespace Rezio.Api.Tests;

/// <summary>
/// Druga strona kontraktu z contracts/smartrate-quote.json. RezFlow mapuje tę
/// odpowiedź w lib/rates/smartrate.ts na podstawie TEGO SAMEGO pliku, więc
/// zmiana nazwy albo usunięcie pola po stronie silnika zapala się tutaj, a nie
/// dopiero na produkcji u konsumenta.
///
/// Celowo porównujemy zestaw pól, a nie wartości: liczby zależą od danych
/// rynkowych i dnia, a kontraktem jest kształt.
/// </summary>
public class QuoteContractTests
{
    private static readonly JsonSerializerOptions ApiOptions = new()
    {
        // ta sama polityka co w Program.cs (ConfigureHttpJsonOptions)
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    /// <summary>Kontrakt leży w korzeniu monorepo — idziemy w górę, aż go znajdziemy.</summary>
    private static JsonObject LoadContract()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "contracts", "smartrate-quote.json");
            if (File.Exists(candidate))
                return JsonNode.Parse(File.ReadAllText(candidate))!.AsObject();
            dir = dir.Parent;
        }
        throw new FileNotFoundException("Nie znaleziono contracts/smartrate-quote.json");
    }

    private static JsonObject Serialize<T>(T value) =>
        JsonNode.Parse(JsonSerializer.Serialize(value, ApiOptions))!.AsObject();

    private static IEnumerable<string> Keys(JsonObject o) =>
        o.Select(kv => kv.Key)
            .Where(key => !key.StartsWith('$'))
            .OrderBy(key => key, StringComparer.Ordinal);

    private static QuoteDay SampleDay() => new(
        new DateOnly(2027, 7, 10),
        RecommendedPrice: 234.5m,
        ClampedBy: "max_price",
        OccupancyRate: 0.82,
        OccupancySource: "scraped",
        DemandScore: 71,
        Components: new QuoteComponents(200m, 1.35, 1.15, 0.9, 1.15, 1.1),
        DemandDrivers: ["długi weekend"]);

    [Fact]
    public void Doba_odpowiedzi_ma_dokladnie_pola_z_kontraktu()
    {
        var expected = Keys(LoadContract()["days"]!.AsArray()[0]!.AsObject());
        var actual = Keys(Serialize(SampleDay()));

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Rozbicie_ceny_ma_dokladnie_mnozniki_z_kontraktu()
    {
        var expected = Keys(
            LoadContract()["days"]!.AsArray()[0]!["components"]!.AsObject());
        var actual = Keys(Serialize(SampleDay().Components));

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Koperta_odpowiedzi_ma_pola_z_kontraktu()
    {
        var response = new QuoteResponse("mkt_gdansk", "Gdańsk", "Seaside", "PLN", [SampleDay()]);
        var expected = Keys(LoadContract());
        var actual = Keys(Serialize(response));

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Nazwy_pol_sa_w_snake_case()
    {
        // konsument mapuje po snake_case; camelCase zepsulby go po cichu
        foreach (var key in Keys(Serialize(SampleDay())))
            Assert.DoesNotMatch("[A-Z]", key);
    }
}
