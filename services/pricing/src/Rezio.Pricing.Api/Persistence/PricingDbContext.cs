using Microsoft.EntityFrameworkCore;

namespace Rezio.Pricing.Api.Persistence;

public sealed class PricingDbContext(DbContextOptions<PricingDbContext> options) : DbContext(options)
{
    public DbSet<MarketDataRecord> MarketData => Set<MarketDataRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MarketDataRecord>(e =>
        {
            e.ToTable("market_data");
            e.HasKey(x => new { x.MarketId, x.Date });
            e.Property(x => x.MarketId).HasMaxLength(64);
        });
    }
}
