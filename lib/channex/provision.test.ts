import { describe, expect, it } from "vitest";
import { buildProvisionInput } from "./provision";

describe("buildProvisionInput", () => {
  it("buduje wejście provisioningu z obiektu i typów", () => {
    const p = { name: "Willa", address: "ul. X 1, Giżycko", checkInFrom: "15:00", checkOutTo: "11:00" };
    const types = [{ id: 7, name: "Apartament", maxGuests: 4, activeUnits: 2 }];
    expect(buildProvisionInput(p, types)).toMatchObject({
      name: "Willa",
      currency: "PLN",
      timezone: "Europe/Warsaw",
      rooms: [{ unitTypeId: 7, title: "Apartament", occupancy: 4, count: 2 }],
    });
  });
});
