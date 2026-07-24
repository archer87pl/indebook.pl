import { describe, expect, it } from "vitest";
import { coalesceRanges } from "./outbox";

describe("coalesceRanges", () => {
  it("scala nachodzące zakresy tego samego typu", () => {
    expect(
      coalesceRanges([
        { unitTypeId: 1, dateFrom: "2026-08-01", dateTo: "2026-08-05" },
        { unitTypeId: 1, dateFrom: "2026-08-04", dateTo: "2026-08-10" },
      ])
    ).toEqual([{ unitTypeId: 1, dateFrom: "2026-08-01", dateTo: "2026-08-10" }]);
  });
  it("różne typy osobno", () => {
    const out = coalesceRanges([
      { unitTypeId: 1, dateFrom: "2026-08-01", dateTo: "2026-08-02" },
      { unitTypeId: 2, dateFrom: "2026-08-01", dateTo: "2026-08-02" },
    ]);
    expect(out).toHaveLength(2);
  });
  it("rozłączne zakresy zostają osobno", () => {
    const out = coalesceRanges([
      { unitTypeId: 1, dateFrom: "2026-08-01", dateTo: "2026-08-02" },
      { unitTypeId: 1, dateFrom: "2026-08-10", dateTo: "2026-08-12" },
    ]);
    expect(out).toHaveLength(2);
  });
});
