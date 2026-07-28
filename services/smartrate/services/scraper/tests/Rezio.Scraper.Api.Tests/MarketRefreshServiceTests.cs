using Microsoft.Extensions.Configuration;
using Rezio.Scraper.Api;

namespace Rezio.Scraper.Api.Tests;

public class MarketRefreshServiceTests
{
    private static IConfiguration Config(params (string Key, string Value)[] entries) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(entries.Select(e =>
                new KeyValuePair<string, string?>(e.Key, e.Value)))
            .Build();

    [Fact]
    public void Bez_MONOLITH_URL_harmonogram_nie_startuje()
    {
        // to chroni testy hostujące aplikację w pamięci przed ruchem sieciowym
        Assert.False(MarketRefreshService.IsEnabled(Config()));
    }

    [Fact]
    public void Skonfigurowany_MONOLITH_URL_wlacza_harmonogram()
    {
        Assert.True(MarketRefreshService.IsEnabled(Config(("MONOLITH_URL", "http://rezio-api:8080"))));
    }

    [Fact]
    public void REFRESH_ENABLED_zero_wylacza_mimo_konfiguracji()
    {
        var config = Config(("MONOLITH_URL", "http://rezio-api:8080"), ("REFRESH_ENABLED", "0"));
        Assert.False(MarketRefreshService.IsEnabled(config));
    }

    [Fact]
    public void Pusty_MONOLITH_URL_traktujemy_jak_brak()
    {
        Assert.False(MarketRefreshService.IsEnabled(Config(("MONOLITH_URL", "   "))));
    }
}
