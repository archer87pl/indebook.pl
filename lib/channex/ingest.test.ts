import { describe, expect, it } from "vitest";
import { pickFreeUnit } from "./ingest";

const units = [{ id: 1 }, { id: 2 }];

describe("pickFreeUnit", () => {
  it("pomija jednostkę zajętą w zakresie", () => {
    const res = [{ unitId: 1, checkIn: "2026-08-01", checkOut: "2026-08-03" }];
    expect(pickFreeUnit(units, res, "2026-08-02", "2026-08-04")).toBe(2);
  });
  it("null gdy wszystkie zajęte", () => {
    const res = [
      { unitId: 1, checkIn: "2026-08-01", checkOut: "2026-08-05" },
      { unitId: 2, checkIn: "2026-08-01", checkOut: "2026-08-05" },
    ];
    expect(pickFreeUnit(units, res, "2026-08-02", "2026-08-03")).toBeNull();
  });
  it("zwraca pierwszą wolną gdy zakres nie koliduje", () => {
    const res = [{ unitId: 1, checkIn: "2026-07-01", checkOut: "2026-07-05" }];
    expect(pickFreeUnit(units, res, "2026-08-02", "2026-08-03")).toBe(1);
  });
});
