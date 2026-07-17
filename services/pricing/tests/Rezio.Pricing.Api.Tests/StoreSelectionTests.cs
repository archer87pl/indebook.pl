namespace Rezio.Pricing.Api.Tests;

public class StoreSelectionTests
{
    [Fact]
    public void No_database_url_selects_in_memory_store()
    {
        Assert.False(StoreSelection.UsesPostgres(null));
        Assert.False(StoreSelection.UsesPostgres(""));
        Assert.False(StoreSelection.UsesPostgres("   "));
    }

    [Fact]
    public void Database_url_selects_postgres_store()
    {
        Assert.True(StoreSelection.UsesPostgres("Host=localhost;Database=rezio;Username=rezio;Password=x"));
    }
}
