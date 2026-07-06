import type { Block, IcalFeed, Reservation } from "@prisma/client";
import { addDaysISO, todayISO } from "./dates";
import { prisma } from "./db";

export type ChannelConflict = {
  block: Block & { feed: IcalFeed | null };
  reservation: Reservation;
  unitName: string;
  unitTypeName: string;
};

/**
 * Podwójne rezerwacje: zaimportowany z kanału zajęty termin nachodzi na
 * aktywną rezerwację bezpośrednią tej samej jednostki.
 */
export async function findChannelConflicts(
  propertyId: number
): Promise<ChannelConflict[]> {
  const blocks = await prisma.block.findMany({
    where: { source: "ICAL", unit: { unitType: { propertyId } } },
    include: { unit: { include: { unitType: true } }, feed: true },
  });
  const conflicts: ChannelConflict[] = [];
  for (const block of blocks) {
    const reservation = await prisma.reservation.findFirst({
      where: {
        unitId: block.unitId,
        checkIn: { lt: block.endDate },
        checkOut: { gt: block.startDate },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (reservation) {
      conflicts.push({
        block,
        reservation,
        unitName: block.unit.name,
        unitTypeName: block.unit.unitType.name,
      });
    }
  }
  return conflicts;
}

export type BusyRange = { start: string; end: string; summary: string };

/** "20260703" | "20260703T140000Z" -> "2026-07-03" */
function icsDateToISO(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Minimalny parser ICS: wyciąga zajęte zakresy [DTSTART, DTEND) z VEVENT.
 * Obsługuje VALUE=DATE i datetime (bierze część dzienną); brak DTEND = 1 doba.
 */
export function parseIcsBusyRanges(ics: string): BusyRange[] {
  // unfold: kontynuacje linii zaczynają się od spacji/tabulatora
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const ranges: BusyRange[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const prop = (name: string) =>
      body.match(new RegExp(`^${name}[^:]*:(.+)$`, "m"))?.[1]?.trim();
    const start = prop("DTSTART") && icsDateToISO(prop("DTSTART")!);
    if (!start) continue;
    const rawEnd = prop("DTEND") && icsDateToISO(prop("DTEND")!);
    const end = rawEnd && rawEnd > start ? rawEnd : addDaysISO(start, 1);
    const summary = prop("SUMMARY") ?? "";
    ranges.push({ start, end, summary });
  }
  return ranges;
}

/**
 * Pobiera feed i podmienia jego blokady (source=ICAL) na aktualne zajęte
 * terminy. Zakresy z przeszłości są pomijane.
 */
export async function syncIcalFeed(
  feed: IcalFeed
): Promise<{ ok: boolean; imported: number; error?: string }> {
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "text/calendar, text/plain, */*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("To nie jest plik iCal.");

    const today = todayISO();
    const ranges = parseIcsBusyRanges(text).filter((r) => r.end > today);

    await prisma.$transaction([
      prisma.block.deleteMany({ where: { feedId: feed.id } }),
      prisma.block.createMany({
        data: ranges.map((r) => ({
          unitId: feed.unitId,
          startDate: r.start,
          endDate: r.end,
          note: r.summary || feed.name || "iCal",
          source: "ICAL",
          feedId: feed.id,
        })),
      }),
      prisma.icalFeed.update({
        where: { id: feed.id },
        data: { lastSyncAt: new Date(), lastError: "" },
      }),
    ]);
    return { ok: true, imported: ranges.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.icalFeed.update({
      where: { id: feed.id },
      data: { lastSyncAt: new Date(), lastError: error },
    });
    return { ok: false, imported: 0, error };
  }
}
