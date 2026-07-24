// Pomocnicze do wyzwalania synchronizacji ARI z poziomu akcji panelu.
import { after } from "next/server";
import { addDaysISO, todayISO } from "../dates";
import { prisma } from "../db";
import { enqueueAri, processOutbox } from "./outbox";

/** Zapis zadania ARI + best-effort push zaraz po akcji (poza ścieżką odpowiedzi). */
export async function afterAri(
  propertyId: number,
  unitTypeId: number,
  from: string,
  to: string
): Promise<void> {
  await enqueueAri(propertyId, unitTypeId, from, to);
  // W kontekście żądania odkładamy push przez after(); poza nim (webhook after,
  // cron, skrypty) after() rzuca — wtedy przetwarzamy inline (fire-and-forget).
  // Gdyby push przepadł, dobierze go zamiatanie cronem.
  try {
    after(() => processOutbox(propertyId));
  } catch {
    void processOutbox(propertyId).catch(() => {});
  }
}

/**
 * Wygodne wpięcie w akcje: po zmianie dostępności jednostki. Sam sprawdza,
 * czy obiekt jest w trybie CHANNEX — jeśli nie, nic nie robi. Bezpieczne do
 * wywołania w każdej akcji operującej na rezerwacji/bloku.
 */
export async function syncUnitRange(unitId: number, from: string, to: string): Promise<void> {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: {
      unitTypeId: true,
      unitType: { select: { propertyId: true, property: { select: { syncMode: true } } } },
    },
  });
  if (!unit || unit.unitType.property.syncMode !== "CHANNEX") return;
  await afterAri(unit.unitType.propertyId, unit.unitTypeId, from, to);
}

/** Pełna resynchronizacja obiektu: enqueue okna dziś..+540 dni dla każdego typu. */
export async function fullResync(propertyId: number): Promise<void> {
  const from = todayISO();
  const to = addDaysISO(from, 540);
  const types = await prisma.unitType.findMany({
    where: { propertyId },
    select: { id: true },
  });
  for (const t of types) await enqueueAri(propertyId, t.id, from, to);
  await processOutbox(propertyId);
}
