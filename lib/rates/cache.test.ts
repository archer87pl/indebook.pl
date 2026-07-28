import { describe, expect, it } from "vitest";
import { RATES_TTL_HOURS, coverage, isStale } from "./cache";

describe("isStale", () => {
  const now = new Date("2026-07-25T12:00:00Z");

  it("wpis młodszy niż TTL jest świeży", () => {
    const fresh = new Date(now.getTime() - (RATES_TTL_HOURS - 1) * 3600_000);
    expect(isStale(fresh, now)).toBe(false);
  });

  it("wpis starszy niż TTL jest nieświeży", () => {
    const old = new Date(now.getTime() - (RATES_TTL_HOURS + 1) * 3600_000);
    expect(isStale(old, now)).toBe(true);
  });
});

describe("coverage", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  const fresh = new Date(now.getTime() - 3600_000);
  const rows = [
    { date: "2026-08-01", priceGr: 20000, fetchedAt: fresh },
    { date: "2026-08-02", priceGr: 23000, fetchedAt: fresh },
  ];

  it("pełne pokrycie zakresu daje complete=true", () => {
    const r = coverage(rows, "2026-08-01", "2026-08-03", now);
    expect(r.complete).toBe(true);
    expect(r.stale).toBe(false);
    expect(r.priceByDate.get("2026-08-02")).toBe(23000);
  });

  it("brakująca noc daje complete=false", () => {
    const r = coverage(rows, "2026-08-01", "2026-08-04", now);
    expect(r.complete).toBe(false);
  });

  it("jeden nieświeży wpis oznacza cały zakres jako stale", () => {
    const old = new Date(now.getTime() - (RATES_TTL_HOURS + 1) * 3600_000);
    const r = coverage(
      [rows[0], { ...rows[1], fetchedAt: old }],
      "2026-08-01",
      "2026-08-03",
      now
    );
    expect(r.complete).toBe(true);
    expect(r.stale).toBe(true);
  });
});
