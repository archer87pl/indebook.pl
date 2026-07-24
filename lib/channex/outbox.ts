// Kolejka ARI (outbox): akcje zapisują zadanie, worker je przetwarza.
import { logEvent } from "../log";
import { prisma } from "../db";
import { roomTypeAvailability } from "./availability";
import { buildAriDays } from "./ari";
import { channelProvider, type ChannelProvider } from "./provider";

export async function enqueueAri(
  propertyId: number,
  unitTypeId: number,
  from: string,
  to: string
): Promise<void> {
  await prisma.ariOutbox.create({
    data: { propertyId, unitTypeId, dateFrom: from, dateTo: to, status: "PENDING" },
  });
}

type Range = { unitTypeId: number; dateFrom: string; dateTo: string };

/** Scala nachodzące/stykające się zakresy per unitType do jednego min–max. */
export function coalesceRanges(rows: Range[]): Range[] {
  const byType = new Map<number, Range[]>();
  for (const r of rows) {
    const arr = byType.get(r.unitTypeId) ?? [];
    arr.push(r);
    byType.set(r.unitTypeId, arr);
  }
  const out: Range[] = [];
  for (const [, arr] of byType) {
    arr.sort((a, b) => (a.dateFrom < b.dateFrom ? -1 : 1));
    const cur = { ...arr[0] };
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].dateFrom <= cur.dateTo) {
        if (arr[i].dateTo > cur.dateTo) cur.dateTo = arr[i].dateTo;
      } else {
        out.push({ ...cur });
        cur.dateFrom = arr[i].dateFrom;
        cur.dateTo = arr[i].dateTo;
      }
    }
    out.push({ ...cur });
  }
  return out;
}

const MAX_ATTEMPTS = 5;

/** Przetwarza zadania ARI danego obiektu: liczy dostępność+minStay i pushuje do Channex. */
export async function processOutbox(
  propertyId: number,
  provider: ChannelProvider | null = channelProvider()
): Promise<{ sent: number; failed: number }> {
  if (!provider) return { sent: 0, failed: 0 };
  const cp = await prisma.channexProperty.findUnique({ where: { propertyId } });
  if (!cp || cp.status !== "ACTIVE") return { sent: 0, failed: 0 };

  const rows = await prisma.ariOutbox.findMany({
    where: { propertyId, status: { in: ["PENDING", "ERROR"] }, attempts: { lt: MAX_ATTEMPTS } },
  });
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const ranges = coalesceRanges(
    rows.map((r) => ({ unitTypeId: r.unitTypeId, dateFrom: r.dateFrom, dateTo: r.dateTo }))
  );

  let sent = 0;
  let failed = 0;
  for (const range of ranges) {
    const ids = rows
      .filter(
        (r) =>
          r.unitTypeId === range.unitTypeId &&
          r.dateFrom >= range.dateFrom &&
          r.dateTo <= range.dateTo
      )
      .map((r) => r.id);
    try {
      const room = await prisma.channexRoom.findUnique({ where: { unitTypeId: range.unitTypeId } });
      const unitType = await prisma.unitType.findUnique({
        where: { id: range.unitTypeId },
        include: { seasons: true },
      });
      if (!room?.channexRoomTypeId || !unitType) throw new Error("Brak mapowania Room Type");
      const avail = await roomTypeAvailability(range.unitTypeId, range.dateFrom, range.dateTo);
      const days = buildAriDays(avail, unitType.minStay, unitType.seasons);
      await provider.pushAri(cp.apiKey, cp.channexId, room.channexRoomTypeId, room.channexRatePlanId, days);
      await prisma.ariOutbox.updateMany({ where: { id: { in: ids } }, data: { status: "SENT" } });
      sent += ids.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.ariOutbox.updateMany({
        where: { id: { in: ids } },
        data: { status: "ERROR", attempts: { increment: 1 }, lastError: msg.slice(0, 300) },
      });
      await logEvent({
        kind: "CHANNEX",
        level: "ERROR",
        propertyId,
        message: "Push ARI nieudany",
        meta: msg.slice(0, 200),
      });
      failed += ids.length;
    }
  }
  return { sent, failed };
}
