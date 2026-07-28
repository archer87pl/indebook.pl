// Builder payloadu ARI: dostępność, min. długość pobytu i cena doby.
// Ceny biorą się z tego samego źródła co wycena dla gościa (quoteStayDynamic),
// więc kanał sprzedaje po tej samej stawce co nasza strona — także wtedy, gdy
// obiekt ma włączony silnik SmartRate.
import type { AriDay } from "./provider";

type SeasonLike = { startDate: string; endDate: string; minStay: number };

/** minStay dla doby: sezon obejmujący datę (inclusive) nadpisuje minStay typu. */
export function minStayForDay(
  date: string,
  unitTypeMinStay: number,
  seasons: SeasonLike[]
): number {
  const s = seasons.find((x) => x.startDate <= date && date <= x.endDate);
  return s ? s.minStay : unitTypeMinStay;
}

export function buildAriDays(
  availability: { date: string; free: number }[],
  unitTypeMinStay: number,
  seasons: SeasonLike[],
  ratesByDate: Map<string, number>,
  fallbackRateGr: number
): AriDay[] {
  return availability.map((a) => ({
    date: a.date,
    availability: a.free,
    minStay: minStayForDay(a.date, unitTypeMinStay, seasons),
    // brak ceny dla doby nie może wysłać zera do kanału — wtedy cennik
    // bazowy jest bezpieczniejszy niż wystawienie pokoju za darmo
    rateGr: ratesByDate.get(a.date) ?? fallbackRateGr,
  }));
}
