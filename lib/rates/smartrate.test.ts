import { describe, expect, it } from "vitest";
import { mapQuoteDay } from "./smartrate";

// Kształt odpowiedzi Rezio.Api (JSON snake_case, ceny w złotówkach)
const raw = {
  date: "2026-07-10",
  recommended_price: 234.5,
  clamped_by: "max_price",
  occupancy_rate: 0.82,
  occupancy_source: "scraped",
  demand_score: 71,
  components: {
    base_price: 200,
    season: 1.35,
    day_of_week: 1.15,
    lead_time: 0.9,
    market_occupancy: 1.15,
    demand: 1.1,
  },
  demand_drivers: ["długi weekend"],
};

describe("mapQuoteDay", () => {
  it("przelicza złotówki na grosze", () => {
    expect(mapQuoteDay(raw).priceGr).toBe(23450);
  });

  it("skraca clamped_by do min/max", () => {
    expect(mapQuoteDay(raw).clampedBy).toBe("max");
    expect(mapQuoteDay({ ...raw, clamped_by: "min_price" }).clampedBy).toBe("min");
    expect(mapQuoteDay({ ...raw, clamped_by: null }).clampedBy).toBeNull();
  });

  it("mapuje mnożniki i drivery popytu", () => {
    const day = mapQuoteDay(raw);
    expect(day.components).toEqual({
      season: 1.35,
      dayOfWeek: 1.15,
      leadTime: 0.9,
      occupancy: 1.15,
      demand: 1.1,
    });
    expect(day.drivers).toEqual(["długi weekend"]);
    expect(day.demandScore).toBe(71);
  });

  it("odrzuca dobę bez daty lub bez ceny", () => {
    expect(() => mapQuoteDay({ ...raw, date: undefined })).toThrow();
    expect(() => mapQuoteDay({ ...raw, recommended_price: "dużo" })).toThrow();
  });
});
