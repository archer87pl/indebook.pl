import { beforeEach, describe, expect, it } from "vitest";
import { stubProvider } from "./provider";

describe("stubProvider", () => {
  beforeEach(() => {
    stubProvider.calls.length = 0;
  });
  it("pushAri zapisuje wywołanie i nie rzuca", async () => {
    await stubProvider.pushAri("k", "stub-prop", "rt", "rp", [
      { date: "2026-08-01", availability: 2, minStay: 1 },
    ]);
    expect(stubProvider.calls).toHaveLength(1);
    expect(stubProvider.calls[0]).toMatchObject({
      roomTypeId: "rt",
      days: [{ date: "2026-08-01", availability: 2 }],
    });
  });
  it("provisionProperty mapuje pokoje na deterministyczne id", async () => {
    const res = await stubProvider.provisionProperty({
      name: "W", address: "", currency: "PLN", timezone: "Europe/Warsaw",
      checkInFrom: "15:00", checkOutTo: "11:00",
      rooms: [{ unitTypeId: 7, title: "Apartament", occupancy: 4, count: 2 }],
    });
    expect(res.rooms[0]).toEqual({ unitTypeId: 7, roomTypeId: "stub-rt-7", ratePlanId: "stub-rp-7" });
  });
});
