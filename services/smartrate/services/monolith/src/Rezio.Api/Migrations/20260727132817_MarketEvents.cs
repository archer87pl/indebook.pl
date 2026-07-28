using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Rezio.Api.Migrations
{
    /// <inheritdoc />
    public partial class MarketEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "market_events",
                columns: table => new
                {
                    MarketId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    EventsJson = table.Column<string>(type: "text", nullable: false),
                    LastWrittenAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_market_events", x => new { x.MarketId, x.Date });
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "market_events");
        }
    }
}
