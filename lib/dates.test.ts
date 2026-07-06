import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  eachNight,
  isValidISO,
  nightsBetween,
  todayISO,
} from "./dates";

describe("isValidISO", () => {
  it("akceptuje poprawne daty", () => {
    expect(isValidISO("2026-07-05")).toBe(true);
    expect(isValidISO("2024-02-29")).toBe(true); // rok przestępny
  });

  it("odrzuca nieistniejące i źle sformatowane daty", () => {
    expect(isValidISO("2026-02-30")).toBe(false);
    expect(isValidISO("2026-13-01")).toBe(false);
    expect(isValidISO("2023-02-29")).toBe(false); // rok nieprzestępny
    expect(isValidISO("05-07-2026")).toBe(false);
    expect(isValidISO("2026-7-5")).toBe(false);
    expect(isValidISO("")).toBe(false);
    expect(isValidISO("abc")).toBe(false);
  });
});

describe("addDaysISO", () => {
  it("dodaje dni w obrębie miesiąca", () => {
    expect(addDaysISO("2026-07-05", 3)).toBe("2026-07-08");
  });

  it("przechodzi granice miesiąca i roku", () => {
    expect(addDaysISO("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("nightsBetween", () => {
  it("liczy noce jako różnicę dat", () => {
    expect(nightsBetween("2026-07-05", "2026-07-07")).toBe(2);
    expect(nightsBetween("2026-07-05", "2026-07-06")).toBe(1);
    expect(nightsBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("eachNight", () => {
  it("zwraca noce z przedziału półotwartego [from, to)", () => {
    expect(eachNight("2026-07-05", "2026-07-08")).toEqual([
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
    ]);
  });

  it("zwraca pustą listę dla zerowego zakresu", () => {
    expect(eachNight("2026-07-05", "2026-07-05")).toEqual([]);
  });
});

describe("todayISO", () => {
  it("zwraca datę w formacie YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(isValidISO(todayISO())).toBe(true);
  });
});
