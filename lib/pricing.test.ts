import { describe, expect, it } from "vitest";
import {
  applyAdjustment,
  isWeekendNight,
  nightAdjustmentPercent,
} from "./pricing";

describe("isWeekendNight", () => {
  it("piątek i sobota to noce weekendowe", () => {
    expect(isWeekendNight("2026-07-10")).toBe(true); // piątek
    expect(isWeekendNight("2026-07-11")).toBe(true); // sobota
  });

  it("niedziela–czwartek to noce zwykłe", () => {
    expect(isWeekendNight("2026-07-12")).toBe(false); // niedziela
    expect(isWeekendNight("2026-07-09")).toBe(false); // czwartek
  });
});

describe("nightAdjustmentPercent", () => {
  const weekend = { kind: "WEEKEND", param: 0, percent: 15 };
  const lastMinute = { kind: "LAST_MINUTE", param: 7, percent: -10 };
  const occupancy = { kind: "OCCUPANCY", param: 80, percent: 10 };
  const today = "2026-07-09"; // czwartek

  it("weekend tylko w pt/sob", () => {
    expect(nightAdjustmentPercent([weekend], "2026-07-10", today, 0)).toBe(15);
    expect(nightAdjustmentPercent([weekend], "2026-07-13", today, 0)).toBe(0);
  });

  it("last minute obejmuje noce w zadanym horyzoncie dni", () => {
    expect(nightAdjustmentPercent([lastMinute], "2026-07-12", today, 0)).toBe(-10);
    expect(nightAdjustmentPercent([lastMinute], "2026-07-16", today, 0)).toBe(-10); // dokładnie 7 dni
    expect(nightAdjustmentPercent([lastMinute], "2026-07-17", today, 0)).toBe(0);
  });

  it("obłożenie od progu w górę", () => {
    expect(nightAdjustmentPercent([occupancy], "2026-07-20", today, 79)).toBe(0);
    expect(nightAdjustmentPercent([occupancy], "2026-07-20", today, 80)).toBe(10);
    expect(nightAdjustmentPercent([occupancy], "2026-07-20", today, 100)).toBe(10);
  });

  it("korekty z kilku reguł się sumują", () => {
    // piątek za 1 dzień przy pełnym obłożeniu: +15 −10 +10
    expect(
      nightAdjustmentPercent([weekend, lastMinute, occupancy], "2026-07-10", today, 100)
    ).toBe(15);
  });
});

describe("applyAdjustment", () => {
  it("podwyżka, rabat i zaokrąglanie do grosza", () => {
    expect(applyAdjustment(28000, 15)).toBe(32200);
    expect(applyAdjustment(28000, -10)).toBe(25200);
    expect(applyAdjustment(28000, 0)).toBe(28000);
    expect(applyAdjustment(33333, 15)).toBe(38333); // 38332,95 → zaokrąglenie
  });

  it("cena nigdy nie spada poniżej zera", () => {
    expect(applyAdjustment(100, -150)).toBe(0);
  });
});
