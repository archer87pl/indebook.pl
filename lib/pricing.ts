import type { RateSeason, UnitType } from "@prisma/client";
import { eachNight, nightsBetween } from "./dates";

export type Quote = {
  nights: number;
  totalGr: number;
  depositGr: number;
  /** najostrzejszy min. pobyt spośród nocy w zakresie */
  minStay: number;
  nightly: { date: string; priceGr: number }[];
};

type UnitTypeWithSeasons = UnitType & { seasons: RateSeason[] };

function seasonFor(seasons: RateSeason[], night: string): RateSeason | undefined {
  return seasons.find((s) => s.startDate <= night && night <= s.endDate);
}

export function quoteStay(
  unitType: UnitTypeWithSeasons,
  from: string,
  to: string,
  depositPercent: number
): Quote {
  const nightly = eachNight(from, to).map((date) => {
    const season = seasonFor(unitType.seasons, date);
    return { date, priceGr: season?.priceGr ?? unitType.basePriceGr };
  });
  const totalGr = nightly.reduce((sum, n) => sum + n.priceGr, 0);
  const minStay = Math.max(
    unitType.minStay,
    ...nightly.map(({ date }) => seasonFor(unitType.seasons, date)?.minStay ?? 1)
  );
  return {
    nights: nightly.length,
    totalGr,
    depositGr: Math.round((totalGr * depositPercent) / 100),
    minStay,
    nightly,
  };
}

// ---------- Ceny dynamiczne (czysta logika; reguły i obłożenie dostarcza
// lib/dynamic-pricing.ts, który zna bazę) ----------

export type PricingRuleLike = { kind: string; param: number; percent: number };

/** Noc weekendowa: piątek lub sobota. */
export function isWeekendNight(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 5 || day === 6;
}

/** Suma korekt % dla nocy wg aktywnych reguł cen dynamicznych. */
export function nightAdjustmentPercent(
  rules: PricingRuleLike[],
  night: string,
  today: string,
  occupancyPct: number
): number {
  let pct = 0;
  for (const r of rules) {
    if (r.kind === "WEEKEND" && isWeekendNight(night)) pct += r.percent;
    if (r.kind === "LAST_MINUTE" && nightsBetween(today, night) <= r.param)
      pct += r.percent;
    if (r.kind === "OCCUPANCY" && occupancyPct >= r.param) pct += r.percent;
  }
  return pct;
}

export function applyAdjustment(priceGr: number, pct: number): number {
  return Math.max(0, Math.round((priceGr * (100 + pct)) / 100));
}
