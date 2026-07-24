import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { stubProvider } from "./provider";
import { enqueueAri, processOutbox } from "./outbox";

// Test workera wymaga bazy (TEST_DATABASE_URL). Bez niej — pomijamy.
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run("processOutbox (stub provider)", () => {
  let propertyId = 0;
  let unitTypeId = 0;

  beforeAll(async () => {
    stubProvider.calls.length = 0;
    const user = await prisma.user.create({
      data: { email: `channex-${Date.now()}@test.pl`, passwordHash: "x", name: "T" },
    });
    const property = await prisma.property.create({
      data: { ownerId: user.id, slug: `channex-${Date.now()}`, name: "T", plan: "PRO", syncMode: "CHANNEX" },
    });
    propertyId = property.id;
    const ut = await prisma.unitType.create({
      data: { propertyId, name: "Apart", maxGuests: 4, basePriceGr: 20000, minStay: 1 },
    });
    unitTypeId = ut.id;
    await prisma.channexRoom.create({
      data: { unitTypeId, channexRoomTypeId: "rt-1", channexRatePlanId: "rp-1" },
    });
    await prisma.channexProperty.create({
      data: { propertyId, channexId: "prop-1", apiKey: "key-1", status: "ACTIVE" },
    });
    const u1 = await prisma.unit.create({ data: { unitTypeId, name: "1" } });
    await prisma.unit.create({ data: { unitTypeId, name: "2" } });
    await prisma.reservation.create({
      data: {
        code: `HO-${Date.now()}`, unitId: u1.id, checkIn: "2026-08-01", checkOut: "2026-08-03",
        guests: 2, guestName: "G", email: "g@x.pl", totalGr: 40000, depositGr: 0, status: "CONFIRMED",
      },
    });
  });

  afterAll(async () => {
    await prisma.ariOutbox.deleteMany({ where: { propertyId } });
    await prisma.reservation.deleteMany({ where: { unit: { unitTypeId } } });
    await prisma.unit.deleteMany({ where: { unitTypeId } });
    await prisma.channexRoom.deleteMany({ where: { unitTypeId } });
    await prisma.channexProperty.deleteMany({ where: { propertyId } });
    await prisma.unitType.deleteMany({ where: { propertyId } });
    const prop = await prisma.property.findUnique({ where: { id: propertyId } });
    await prisma.property.delete({ where: { id: propertyId } });
    if (prop) await prisma.user.delete({ where: { id: prop.ownerId } });
  });

  it("pushuje ARI ze stubem i oznacza wiersze SENT", async () => {
    await enqueueAri(propertyId, unitTypeId, "2026-08-01", "2026-08-04");
    const res = await processOutbox(propertyId, stubProvider);
    expect(res.sent).toBe(1);
    expect(stubProvider.calls).toHaveLength(1);
    const days = stubProvider.calls[0].days;
    // 2 jednostki, rezerwacja [08-01,08-03) zajmuje 1 → wolne 1,1,2
    expect(days.find((d) => d.date === "2026-08-01")?.availability).toBe(1);
    expect(days.find((d) => d.date === "2026-08-03")?.availability).toBe(2);
    const rows = await prisma.ariOutbox.findMany({ where: { propertyId } });
    expect(rows.every((r) => r.status === "SENT")).toBe(true);
  });
});
