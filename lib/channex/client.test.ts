import { describe, expect, it } from "vitest";
import { availabilityValues, restrictionValues } from "./client";

const days = [{ date: "2026-08-01", availability: 2, minStay: 3 }];

describe("availabilityValues", () => {
  it("mapuje na payload dostępności Channex", () => {
    expect(availabilityValues("P", "RT", days)).toEqual([
      { property_id: "P", room_type_id: "RT", date: "2026-08-01", availability: 2 },
    ]);
  });
});

describe("restrictionValues", () => {
  it("mapuje minStay na min_stay_arrival", () => {
    expect(restrictionValues("P", "RP", days)).toEqual([
      { property_id: "P", rate_plan_id: "RP", date: "2026-08-01", min_stay_arrival: 3 },
    ]);
  });
});
