import { describe, expect, it } from "vitest";
import { availabilityValues, restrictionValues } from "./client";

const days = [{ date: "2026-08-01", availability: 2, minStay: 3, rateGr: 42050 }];

describe("availabilityValues", () => {
  it("mapuje na payload dostępności Channex", () => {
    expect(availabilityValues("P", "RT", days)).toEqual([
      { property_id: "P", room_type_id: "RT", date: "2026-08-01", availability: 2 },
    ]);
  });
});

describe("restrictionValues", () => {
  it("mapuje minStay na min_stay_arrival, a grosze na kwotę w walucie", () => {
    expect(restrictionValues("P", "RP", days)).toEqual([
      {
        property_id: "P",
        rate_plan_id: "RP",
        date: "2026-08-01",
        min_stay_arrival: 3,
        rate: "420.50",
      },
    ]);
  });

  it("kwota ma zawsze dwa miejsca po przecinku", () => {
    const round = [{ date: "2026-08-02", availability: 1, minStay: 1, rateGr: 40000 }];
    expect(restrictionValues("P", "RP", round)[0].rate).toBe("400.00");
  });
});
