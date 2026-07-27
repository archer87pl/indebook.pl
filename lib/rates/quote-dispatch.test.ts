import { describe, expect, it } from "vitest";
import { applyCachedRates } from "../dynamic-pricing";

const base = {
  nights: 2,
  totalGr: 40000,
  depositGr: 12000,
  minStay: 2,
  nightly: [
    { date: "2026-08-01", priceGr: 20000 },
    { date: "2026-08-02", priceGr: 20000 },
  ],
};

describe("applyCachedRates", () => {
  it("podmienia ceny nocy i przelicza sumę oraz zaliczkę", () => {
    const rates = new Map([
      ["2026-08-01", 18000],
      ["2026-08-02", 23000],
    ]);
    const q = applyCachedRates(base, rates, 30);
    expect(q.nightly.map((n) => n.priceGr)).toEqual([18000, 23000]);
    expect(q.totalGr).toBe(41000);
    expect(q.depositGr).toBe(12300);
  });

  it("nie rusza minStay ani liczby nocy", () => {
    const q = applyCachedRates(
      base,
      new Map([
        ["2026-08-01", 1],
        ["2026-08-02", 1],
      ]),
      30
    );
    expect(q.minStay).toBe(2);
    expect(q.nights).toBe(2);
  });
});
