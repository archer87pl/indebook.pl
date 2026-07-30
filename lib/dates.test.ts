import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  eachNight,
  formatDateShort,
  formatDateShortPl,
  formatRangeShort,
  formatRangeShortPl,
  isValidISO,
  nightsBetween,
  shiftMonth,
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

// shiftMonth obsługuje strzałki „poprzedni / następny miesiąc" w kalendarzu
// obłożenia. Przełom roku to jedyne miejsce, gdzie arytmetyka jest nieoczywista.
describe("shiftMonth", () => {
  it("przesuwa w przód i w tył w obrębie roku", () => {
    expect(shiftMonth("2026-07", 1)).toBe("2026-08");
    expect(shiftMonth("2026-07", -1)).toBe("2026-06");
    expect(shiftMonth("2026-07", 3)).toBe("2026-10");
  });

  it("przechodzi przez przełom roku w obie strony", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("przeskok o wiele miesięcy trafia we właściwy rok", () => {
    expect(shiftMonth("2026-07", 12)).toBe("2027-07");
    expect(shiftMonth("2026-07", -12)).toBe("2025-07");
    expect(shiftMonth("2026-07", 18)).toBe("2028-01");
  });

  it("zero nie zmienia miesiąca", () => {
    expect(shiftMonth("2026-07", 0)).toBe("2026-07");
  });

  it("miesiąc zawsze ma dwie cyfry", () => {
    // wartość wraca do URL-a i do zapytań — „2026-7" nie przeszłoby walidacji
    expect(shiftMonth("2026-12", 1)).toMatch(/^\d{4}-\d{2}$/);
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
  });
});

describe("formatRangeShort", () => {
  it("pobyt w jednym miesiącu skraca zapis do jednej nazwy miesiąca", () => {
    // „10–14 sie" zamiast „10 sie – 14 sie"
    const range = formatRangeShort("2026-08-10", "2026-08-14", "pl-PL");

    expect(range).toMatch(/^10–14/);
    expect(range.match(/sie/g) ?? []).toHaveLength(1);
  });

  it("pobyt na przełomie miesięcy pokazuje oba miesiące", () => {
    const range = formatRangeShort("2026-08-30", "2026-09-02", "pl-PL");

    expect(range).toContain("–");
    expect(range).toMatch(/sie/);
    expect(range).toMatch(/wrz/);
  });

  it("skróty polskie mają swoje aliasy dla panelu", () => {
    expect(formatRangeShortPl("2026-08-10", "2026-08-14")).toBe(
      formatRangeShort("2026-08-10", "2026-08-14", "pl-PL")
    );
    expect(formatDateShortPl("2026-08-10")).toBe(formatDateShort("2026-08-10", "pl-PL"));
  });
});
