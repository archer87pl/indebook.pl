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

/** Rzucane, gdy termin zniknął między sprawdzeniem a zapisem. */
export class NoUnitsError extends Error {
  constructor() {
    super("NO_UNITS");
  }
}

/**
 * Transakcja przydzielająca jednostkę gościowi.
 *
 * `freeUnits` to zwykły ODCZYT — na domyślnym poziomie izolacji (READ
 * COMMITTED) dwie równoczesne rezerwacje widzą ten sam ostatni wolny pokój
 * i obie go zapisują. Kończy się to dwiema rezerwacjami na jedno łóżko,
 * czyli najgorszą awarią, jaka może spotkać obiekt: gość przyjeżdża, a pokój
 * jest zajęty. Okno jest wąskie (milisekundy), ale trafia dokładnie tam, gdzie
 * boli — w ostatni wolny pokój w oblegany termin.
 *
 * Nie ma tu na czym założyć blokady wiersza: sprawdzamy NIEOBECNOŚĆ kolidującej
 * rezerwacji, a nieistniejącego wiersza nie da się zablokować. Dlatego wymuszamy
 * SERIALIZABLE — Postgres wykrywa zależność odczyt→zapis i wywraca drugą
 * transakcję zamiast pozwolić na podwójną sprzedaż.
 *
 * Konflikt (P2034) jest nieodróżnialny dla gościa od „ktoś był szybszy",
 * więc obie sytuacje kończą się tym samym komunikatem.
 */
export async function bookingTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
  } catch (e) {
    if (isSerializationFailure(e)) throw new NoUnitsError();
    throw e;
  }
}

/**
 * P2034 = zapis skonfliktowany albo zakleszczenie; przy SERIALIZABLE tak
 * właśnie zgłasza się przegrana w wyścigu. Kod bazy (40001) sprawdzamy też
 * wprost, bo pojawia się przy zapytaniach surowych, gdzie Prisma go nie tłumaczy.
 */
function isSerializationFailure(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === "P2034" || code === "40001";
}

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
  ignoreReservationId?: number,
  tx: Tx = prisma
) {
  const conflict = await tx.unit.findFirst({
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
