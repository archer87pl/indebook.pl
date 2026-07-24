// Dostępność typu pokoju dla Channex: liczba wolnych aktywnych Unitów per doba.
// W trybie CHANNEX bloki iCal nie istnieją — liczymy tylko bloki MANUAL;
// rezerwacje z OTA są zwykłymi rezerwacjami, więc wpadają w conflictingReservationWhere.

import type { Prisma } from "@prisma/client";
import { conflictingReservationWhere } from "../availability";
import { addDaysISO } from "../dates";
import { prisma } from "../db";

/** Czysta: dla każdej doby liczba wolnych = jednostki − nachodzące (rezerwacje+bloki), min 0. */
export function countFreePerDay(
  days: string[],
  unitCount: number,
  reservations: { checkIn: string; checkOut: string }[],
  blocks: { startDate: string; endDate: string }[]
): { date: string; free: number }[] {
  return days.map((date) => {
    const next = addDaysISO(date, 1);
    const busyRes = reservations.filter((r) => r.checkIn < next && r.checkOut > date).length;
    const busyBlk = blocks.filter((b) => b.startDate < next && b.endDate > date).length;
    return { date, free: Math.max(0, unitCount - busyRes - busyBlk) };
  });
}

/** Dostępność typu pokoju per doba w [from, to) z danych w bazie. */
export async function roomTypeAvailability(
  unitTypeId: number,
  from: string,
  to: string
): Promise<{ date: string; free: number }[]> {
  const units = await prisma.unit.findMany({
    where: { unitTypeId, active: true },
    select: {
      reservations: {
        where: conflictingReservationWhere(from, to) as Prisma.ReservationWhereInput,
        select: { checkIn: true, checkOut: true },
      },
      blocks: {
        where: { source: "MANUAL", startDate: { lt: to }, endDate: { gt: from } },
        select: { startDate: true, endDate: true },
      },
    },
  });
  const unitCount = units.length;
  const reservations = units.flatMap((u) => u.reservations);
  const blocks = units.flatMap((u) => u.blocks);
  const days: string[] = [];
  for (let d = from; d < to; d = addDaysISO(d, 1)) days.push(d);
  return countFreePerDay(days, unitCount, reservations, blocks);
}
