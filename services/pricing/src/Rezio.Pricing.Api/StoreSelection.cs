namespace Rezio.Pricing.Api;

public static class StoreSelection
{
    public static bool UsesPostgres(string? databaseUrl) => !string.IsNullOrWhiteSpace(databaseUrl);
}
