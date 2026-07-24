import { describe, expect, it } from "vitest";
import { countFreePerDay } from "./availability";

describe("countFreePerDay", () => {
  const days = ["2026-08-01", "2026-08-02", "2026-08-03"];
  it("bez zajętości = pełna liczba jednostek", () => {
    expect(countFreePerDay(days, 2, [], [])).toEqual([
      { date: "2026-08-01", free: 2 },
      { date: "2026-08-02", free: 2 },
      { date: "2026-08-03", free: 2 },
    ]);
  });
  it("rezerwacja [08-01,08-03) zajmuje 1 jednostkę w tych dobach", () => {
    const res = [{ checkIn: "2026-08-01", checkOut: "2026-08-03" }];
    expect(countFreePerDay(days, 2, res, [])).toEqual([
      { date: "2026-08-01", free: 1 },
      { date: "2026-08-02", free: 1 },
      { date: "2026-08-03", free: 2 },
    ]);
  });
  it("blok nakłada się z rezerwacją — nie schodzi poniżej 0", () => {
    const res = [{ checkIn: "2026-08-01", checkOut: "2026-08-02" }];
    const blocks = [{ startDate: "2026-08-01", endDate: "2026-08-02" }];
    expect(countFreePerDay(days, 1, res, blocks)).toEqual([
      { date: "2026-08-01", free: 0 },
      { date: "2026-08-02", free: 1 },
      { date: "2026-08-03", free: 1 },
    ]);
  });
});
