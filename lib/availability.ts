import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Rezerwacja koliduje z zakresem [from, to), jeśli jest CONFIRMED
 * albo PENDING z niewygasłą blokadą płatności.
 */
export function conflictingReservationWhere(
  from: string,
  to: string,
  excludeReservationId?: number
): Prisma.ReservationWhereInput {
  return {
    checkIn: { lt: to },
    checkOut: { gt: from },
    ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    OR: [
      { status: "CONFIRMED" },
      { status: "PENDING", expiresAt: { gt: new Date() } },
    ],
  };
}

type Tx = Prisma.TransactionClient | typeof prisma;

/** Wolne jednostki danego typu w zakresie [from, to). */
export async function freeUnits(
  unitTypeId: number,
  from: string,
  to: string,
  tx: Tx = prisma,
  excludeReservationId?: number
) {
  return tx.unit.findMany({
    where: {
      unitTypeId,
      active: true,
      reservations: {
        none: conflictingReservationWhere(from, to, excludeReservationId),
      },
      blocks: { none: { startDate: { lt: to }, endDate: { gt: from } } },
    },
    orderBy: { id: "asc" },
  });
}

/** Czy konkretna jednostka jest wolna w [from, to) (z opcjonalnym pominięciem rezerwacji). */
export async function isUnitFree(
  unitId: number,
  from: string,
  to: string,
  ignoreReservationId?: number
) {
  const conflict = await prisma.unit.findFirst({
    where: {
      id: unitId,
      OR: [
        {
          reservations: {
            some: {
              ...conflictingReservationWhere(from, to),
              ...(ignoreReservationId ? { id: { not: ignoreReservationId } } : {}),
            },
          },
        },
        { blocks: { some: { startDate: { lt: to }, endDate: { gt: from } } } },
      ],
    },
  });
  return conflict === null;
}
