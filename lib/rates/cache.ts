// Odczyt cache'u rekomendacji. Ścieżka gościa nie robi HTTP — czyta stąd,
// a nieświeże/niepełne pokrycie tylko zleca odświeżenie w tle.
import { eachNight } from "../dates";
import { prisma } from "../db";

export const RATES_TTL_HOURS = Number(process.env.SMARTRATE_TTL_HOURS) || 12;

export type CachedRates = {
  /** cena nocy w groszach, tylko dla dat obecnych w cache */
  priceByDate: Map<string, number>;
  /** czy cache pokrywa KAŻDĄ noc zakresu */
  complete: boolean;
  /** czy którykolwiek wpis przekroczył TTL */
  stale: boolean;
};

export function isStale(fetchedAt: Date, now: Date): boolean {
  return now.getTime() - fetchedAt.getTime() > RATES_TTL_HOURS * 3600_000;
}

type RateRow = { date: string; priceGr: number; fetchedAt: Date };

/** Czysta część: ocena pokrycia i świeżości. `to` wyłącznie (jak checkOut). */
export function coverage(
  rows: RateRow[],
  from: string,
  to: string,
  now: Date
): CachedRates {
  const priceByDate = new Map(rows.map((r) => [r.date, r.priceGr]));
  const nights = eachNight(from, to);
  return {
    priceByDate,
    complete: nights.length > 0 && nights.every((n) => priceByDate.has(n)),
    stale: rows.some((r) => isStale(r.fetchedAt, now)),
  };
}

/** Rekomendacje dla typu pokoju w zakresie [from, to). */
export async function cachedRates(
  unitTypeId: number,
  from: string,
  to: string
): Promise<CachedRates> {
  const rows = await prisma.dynamicRate.findMany({
    where: { unitTypeId, date: { gte: from, lt: to } },
    select: { date: true, priceGr: true, fetchedAt: true },
  });
  return coverage(rows, from, to, new Date());
}
