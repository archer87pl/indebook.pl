import { describe, expect, it } from "vitest";
import { buildAriDays, minStayForDay } from "./ari";

const seasons = [{ startDate: "2026-08-01", endDate: "2026-08-31", minStay: 3 }];

describe("minStayForDay", () => {
  it("sezon nadpisuje minStay typu", () =>
    expect(minStayForDay("2026-08-10", 1, seasons)).toBe(3));
  it("poza sezonem — minStay typu", () =>
    expect(minStayForDay("2026-09-10", 2, seasons)).toBe(2));
});

describe("buildAriDays", () => {
  it("łączy dostępność z minStay", () => {
    const avail = [
      { date: "2026-08-01", free: 2 },
      { date: "2026-09-01", free: 1 },
    ];
    expect(buildAriDays(avail, 1, seasons)).toEqual([
      { date: "2026-08-01", availability: 2, minStay: 3 },
      { date: "2026-09-01", availability: 1, minStay: 1 },
    ]);
  });
});
