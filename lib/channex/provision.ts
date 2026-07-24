// Provisioning obiektu w Channex: Property + Room Type + Rate Plan per typ,
// rejestracja webhooka, zapis mapowania i pełny push ARI.
import { prisma } from "../db";
import { logEvent } from "../log";
import { appUrl } from "../payments";
import { channelProvider, type ProvisionInput } from "./provider";
import { fullResync } from "./enqueue-helpers";

export function buildProvisionInput(
  property: { name: string; address: string; checkInFrom: string; checkOutTo: string },
  types: { id: number; name: string; maxGuests: number; activeUnits: number }[]
): ProvisionInput {
  return {
    name: property.name,
    address: property.address,
    currency: "PLN",
    timezone: "Europe/Warsaw",
    checkInFrom: property.checkInFrom,
    checkOutTo: property.checkOutTo,
    rooms: types.map((t) => ({
      unitTypeId: t.id,
      title: t.name,
      occupancy: t.maxGuests,
      count: t.activeUnits,
    })),
  };
}

export async function provisionForProperty(propertyId: number): Promise<void> {
  const provider = channelProvider();
  if (!provider) throw new Error("Channex nie jest skonfigurowany.");
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    include: { unitTypes: { include: { units: { where: { active: true }, select: { id: true } } } } },
  });
  const types = property.unitTypes.map((t) => ({
    id: t.id,
    name: t.name,
    maxGuests: t.maxGuests,
    activeUnits: t.units.length,
  }));
  const input = buildProvisionInput(property, types);
  try {
    const res = await provider.provisionProperty(input);
    await prisma.$transaction(async (tx) => {
      await tx.channexProperty.upsert({
        where: { propertyId },
        create: {
          propertyId,
          channexId: res.channexPropertyId,
          apiKey: res.apiKey,
          status: "ACTIVE",
          syncedAt: new Date(),
        },
        update: {
          channexId: res.channexPropertyId,
          apiKey: res.apiKey,
          status: "ACTIVE",
          lastError: "",
          syncedAt: new Date(),
        },
      });
      for (const r of res.rooms) {
        await tx.channexRoom.upsert({
          where: { unitTypeId: r.unitTypeId },
          create: {
            unitTypeId: r.unitTypeId,
            channexRoomTypeId: r.roomTypeId,
            channexRatePlanId: r.ratePlanId,
          },
          update: { channexRoomTypeId: r.roomTypeId, channexRatePlanId: r.ratePlanId },
        });
      }
    });
    // rejestracja webhooka rezerwacji (idempotentne po stronie Channex bywa
    // różne — błąd nie przerywa provisioningu, logujemy)
    const secret = process.env.CHANNEX_WEBHOOK_SECRET ?? "";
    if (secret) {
      try {
        await provider.registerWebhook(res.channexPropertyId, `${appUrl()}/api/channex/webhook`, secret);
      } catch (e) {
        await logEvent({
          kind: "CHANNEX",
          level: "WARN",
          propertyId,
          message: "Nie udało się zarejestrować webhooka Channex",
          meta: (e instanceof Error ? e.message : String(e)).slice(0, 200),
        });
      }
    }
    await logEvent({
      kind: "CHANNEX",
      level: "INFO",
      propertyId,
      message: "Obiekt zsynchronizowany z Channex (provisioning)",
    });
    await fullResync(propertyId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.channexProperty.upsert({
      where: { propertyId },
      create: { propertyId, status: "ERROR", lastError: msg.slice(0, 300) },
      update: { status: "ERROR", lastError: msg.slice(0, 300) },
    });
    await logEvent({
      kind: "CHANNEX",
      level: "ERROR",
      propertyId,
      message: "Provisioning Channex nieudany",
      meta: msg.slice(0, 200),
    });
    throw e;
  }
}
