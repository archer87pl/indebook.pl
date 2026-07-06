import type { RateSeason, UnitType } from "@prisma/client";
import { eachNight } from "./dates";

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
