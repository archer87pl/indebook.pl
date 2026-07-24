// Import rezerwacji z OTA (Channex) do RezOp: auto-assign wolnego Unitu,
// upsert po channexBookingId, obsługa oversell (konflikt) i anulowań.
import { randomInt } from "node:crypto";
import { prisma } from "../db";
import { logEvent } from "../log";
import type { BookingData } from "./provider";
import { afterAri } from "./enqueue-helpers";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `HO-${s}`;
}

/** Pierwszy Unit bez nachodzącej rezerwacji w [from, to); null gdy wszystkie zajęte. */
export function pickFreeUnit(
  units: { id: number }[],
  reservations: { unitId: number; checkIn: string; checkOut: string }[],
  from: string,
  to: string
): number | null {
  for (const u of units) {
    const busy = reservations.some(
      (r) => r.unitId === u.id && r.checkIn < to && r.checkOut > from
    );
    if (!busy) return u.id;
  }
  return null;
}

export async function ingestBooking(b: BookingData): Promise<void> {
  const cp = await prisma.channexProperty.findFirst({
    where: { channexId: b.channexPropertyId },
    select: { propertyId: true },
  });
  const room = await prisma.channexRoom.findFirst({
    where: { channexRoomTypeId: b.channexRoomTypeId },
    select: { unitTypeId: true },
  });
  if (!cp || !room) {
    await logEvent({
      kind: "CHANNEX",
      level: "ERROR",
      propertyId: cp?.propertyId,
      message: "Rezerwacja OTA bez mapowania obiektu/pokoju",
      meta: b.channexBookingId,
    });
    return;
  }

  const existing = await prisma.reservation.findUnique({
    where: { channexBookingId: b.channexBookingId },
  });

  if (b.status === "cancelled") {
    if (existing && existing.status !== "CANCELLED") {
      await prisma.reservation.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });
      await afterAri(cp.propertyId, room.unitTypeId, existing.checkIn, existing.checkOut);
      await logEvent({
        kind: "CHANNEX",
        level: "INFO",
        propertyId: cp.propertyId,
        message: `Anulowano rezerwację OTA ${existing.code}`,
        meta: b.channel,
      });
    }
    return;
  }

  const units = await prisma.unit.findMany({
    where: { unitTypeId: room.unitTypeId, active: true },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const overlapping = await prisma.reservation.findMany({
    where: {
      unit: { unitTypeId: room.unitTypeId },
      status: { in: ["CONFIRMED", "PENDING"] },
      checkIn: { lt: b.departure },
      checkOut: { gt: b.arrival },
      ...(existing ? { id: { not: existing.id } } : {}),
    },
    select: { unitId: true, checkIn: true, checkOut: true },
  });

  let unitId = pickFreeUnit(units, overlapping, b.arrival, b.departure);
  let conflict = false;
  if (unitId === null) {
    unitId = units[0]?.id ?? null;
    conflict = true;
  }
  if (unitId === null) {
    await logEvent({
      kind: "CHANNEX",
      level: "ERROR",
      propertyId: cp.propertyId,
      message: "Rezerwacja OTA — typ pokoju bez aktywnych jednostek",
      meta: b.channexBookingId,
    });
    return;
  }

  const data = {
    unitId,
    checkIn: b.arrival,
    checkOut: b.departure,
    guests: b.guests,
    guestName: b.guestName,
    email: b.email,
    phone: b.phone,
    totalGr: b.totalGr,
    depositGr: 0,
    status: "CONFIRMED",
    source: b.channel,
    channexBookingId: b.channexBookingId,
    otaCommissionGr: b.commissionGr,
    expiresAt: null,
  };
  if (existing) {
    await prisma.reservation.update({ where: { id: existing.id }, data });
  } else {
    await prisma.reservation.create({ data: { ...data, code: newCode() } });
  }
  await afterAri(cp.propertyId, room.unitTypeId, b.arrival, b.departure);
  await logEvent({
    kind: "CHANNEX",
    level: conflict ? "ERROR" : "INFO",
    propertyId: cp.propertyId,
    message: conflict
      ? `Rezerwacja OTA z KONFLIKTEM (brak wolnej jednostki) — ${b.channel}`
      : `Nowa rezerwacja OTA — ${b.channel}`,
    meta: b.channexBookingId,
  });
}
