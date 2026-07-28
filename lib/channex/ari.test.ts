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
  const avail = [
    { date: "2026-08-01", free: 2 },
    { date: "2026-09-01", free: 1 },
  ];
  const rates = new Map([
    ["2026-08-01", 42000],
    ["2026-09-01", 31000],
  ]);

  it("łączy dostępność, minStay i cenę doby", () => {
    expect(buildAriDays(avail, 1, seasons, rates, 25000)).toEqual([
      { date: "2026-08-01", availability: 2, minStay: 3, rateGr: 42000 },
      { date: "2026-09-01", availability: 1, minStay: 1, rateGr: 31000 },
    ]);
  });

  it("dla doby bez ceny bierze cenę bazową, a nie zero", () => {
    // wystawienie pokoju za 0 zł w kanale byłoby gorsze niż cennik bazowy
    const days = buildAriDays(avail, 1, seasons, new Map(), 25000);
    expect(days.map((d) => d.rateGr)).toEqual([25000, 25000]);
  });

  it("uzupełnia tylko brakujące doby, znanych cen nie nadpisuje", () => {
    const partial = new Map([["2026-08-01", 42000]]);
    const days = buildAriDays(avail, 1, seasons, partial, 25000);
    expect(days.map((d) => d.rateGr)).toEqual([42000, 25000]);
  });
});
