// Pobranie rekomendacji do cache'u. Wołane wyłącznie poza ścieżką odpowiedzi
// (after() albo cron) — gość nigdy nie czeka na SmartRate.
import { after } from "next/server";
import { addDaysISO } from "../dates";
import { prisma } from "../db";
import { pricingPlanFeatures } from "../plans";
import { ratesProvider } from "./provider";

/** Okno wygaszania: kolejne zlecenia dla tego samego zakresu są pomijane. */
export const COALESCE_SECONDS = 60;

/** Widełki startowe przy pierwszym włączeniu trybu: −30% / +80% ceny bazowej. */
export function defaultGuards(basePriceGr: number): {
  minPriceGr: number;
  maxPriceGr: number;
} {
  return {
    minPriceGr: Math.max(1, Math.round(basePriceGr * 0.7)),
    maxPriceGr: Math.max(1, Math.round(basePriceGr * 1.8)),
  };
}

/**
 * Pobiera rekomendacje dla [from, to) i zapisuje do DynamicRate.
 * Zwraca liczbę zapisanych dób (0 = nic nie zrobiono).
 */
export async function refreshRates(
  unitTypeId: number,
  from: string,
  to: string
): Promise<number> {
  const provider = ratesProvider();
  if (!provider) return 0;

  const unitType = await prisma.unitType.findUnique({
    where: { id: unitTypeId },
    select: {
      id: true,
      basePriceGr: true,
      minPriceGr: true,
      maxPriceGr: true,
      propertyId: true,
      property: {
        select: { plan: true, pricingMode: true, smartRateMarketId: true },
      },
    },
  });
  if (!unitType) return 0;
  const { property } = unitType;
  if (property.pricingMode !== "SMARTRATE") return 0;
  if (!pricingPlanFeatures(property.plan).smartRate) return 0;
  if (!property.smartRateMarketId) return 0;

  // coalesce: ktoś już odświeżał ten zakres w ostatniej minucie
  const recent = await prisma.dynamicRate.findFirst({
    where: {
      unitTypeId,
      date: { gte: from, lt: to },
      fetchedAt: { gt: new Date(Date.now() - COALESCE_SECONDS * 1000) },
    },
    select: { id: true },
  });
  if (recent) return 0;

  const guards = defaultGuards(unitType.basePriceGr);
  try {
    const days = await provider.quote({
      marketId: property.smartRateMarketId,
      basePriceGr: unitType.basePriceGr,
      minPriceGr: unitType.minPriceGr ?? guards.minPriceGr,
      maxPriceGr: unitType.maxPriceGr ?? guards.maxPriceGr,
      from,
      to: addDaysISO(to, -1), // API liczy „to" włącznie, my dostajemy checkOut
    });
    for (const day of days) {
      await prisma.dynamicRate.upsert({
        where: { unitTypeId_date: { unitTypeId, date: day.date } },
        update: {
          priceGr: day.priceGr,
          clampedBy: day.clampedBy,
          demandScore: day.demandScore,
          drivers: JSON.stringify(day.drivers),
          components: JSON.stringify(day.components),
        },
        create: {
          unitTypeId,
          date: day.date,
          priceGr: day.priceGr,
          clampedBy: day.clampedBy,
          demandScore: day.demandScore,
          drivers: JSON.stringify(day.drivers),
          components: JSON.stringify(day.components),
        },
      });
    }
    await prisma.property.update({
      where: { id: unitType.propertyId },
      data: { smartRateSyncedAt: new Date(), smartRateError: "" },
    });
    return days.length;
  } catch (e) {
    // awaria jest cicha dla gościa (wycena degraduje do reguł) i głośna
    // dla właściciela — komunikat ląduje w panelu
    const message = e instanceof Error ? e.message : "Nieznany błąd";
    await prisma.property.update({
      where: { id: unitType.propertyId },
      data: { smartRateError: message.slice(0, 300) },
    });
    return 0;
  }
}

/**
 * Zlecenie odświeżenia poza ścieżką odpowiedzi. W kontekście żądania przez
 * after(); poza nim (cron, skrypty) after() rzuca — wtedy fire-and-forget.
 */
export async function afterRates(
  unitTypeId: number,
  from: string,
  to: string
): Promise<void> {
  try {
    after(() => refreshRates(unitTypeId, from, to));
  } catch {
    void refreshRates(unitTypeId, from, to).catch(() => {});
  }
}

/** Zmiana cennika/widełek/rynku unieważnia rekomendacje danego typu pokoju. */
export async function invalidateRates(unitTypeId: number): Promise<void> {
  await prisma.dynamicRate.deleteMany({ where: { unitTypeId } });
}
