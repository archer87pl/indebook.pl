using System.Text.Json;
using Rezio.Scraper.Api;

namespace Rezio.Scraper.Api.Tests;

public class TicketmasterParsingTests
{
    // Kształt odpowiedzi Discovery API v2 (/discovery/v2/events.json)
    private const string Payload = """
    {
      "_embedded": {
        "events": [
          {
            "id": "Z698xZq",
            "name": "Kult - trasa 2027",
            "dates": { "start": { "localDate": "2027-03-05", "localTime": "19:00:00" } },
            "classifications": [ { "segment": { "name": "Music" } } ],
            "_embedded": { "venues": [ { "name": "Ergo Arena" } ] }
          },
          {
            "id": "Z698xTBA",
            "name": "Bez ogloszonej daty",
            "dates": { "start": { "dateTBD": true } },
            "classifications": [ { "segment": { "name": "Music" } } ]
          },
          {
            "id": "Z698xSport",
            "name": "Mecz ligowy",
            "dates": { "start": { "localDate": "2027-03-06" } },
            "classifications": [ { "segment": { "name": "Sports" } } ]
          }
        ]
      },
      "page": { "size": 200, "totalPages": 1, "number": 0 }
    }
    """;

    private static List<Rezio.Scraper.Domain.SourceEvent> Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return TicketmasterEventSource.ParsePage(document.RootElement).ToList();
    }

    [Fact]
    public void Wyciaga_identyfikator_nazwe_date_i_kategorie()
    {
        var events = Parse(Payload);

        var concert = events.Single(e => e.ExternalRef == "Z698xZq");
        Assert.Equal("Kult - trasa 2027", concert.Name);
        Assert.Equal(new DateOnly(2027, 3, 5), concert.Date);
        Assert.Equal("Music", concert.Segment);
    }

    [Fact]
    public void Pomija_pozycje_bez_ogloszonej_daty()
    {
        var events = Parse(Payload);
        Assert.DoesNotContain(events, e => e.ExternalRef == "Z698xTBA");
        Assert.Equal(2, events.Count);
    }

    [Fact]
    public void Radzi_sobie_z_odpowiedzia_bez_wydarzen()
    {
        Assert.Empty(Parse("""{ "page": { "size": 200, "totalPages": 0, "number": 0 } }"""));
    }

    [Fact]
    public void Wydarzenie_bez_kategorii_dostaje_pusty_segment_zamiast_wyjatku()
    {
        var events = Parse("""
        {
          "_embedded": { "events": [
            { "id": "x", "name": "Bez kategorii",
              "dates": { "start": { "localDate": "2027-03-05" } } }
          ] }
        }
        """);

        Assert.Equal("", Assert.Single(events).Segment);
    }
}
