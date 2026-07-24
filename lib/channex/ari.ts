// Builder payloadu ARI (MVP: dostępność + min. długość pobytu, bez cen).
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
  seasons: SeasonLike[]
): AriDay[] {
  return availability.map((a) => ({
    date: a.date,
    availability: a.free,
    minStay: minStayForDay(a.date, unitTypeMinStay, seasons),
  }));
}
