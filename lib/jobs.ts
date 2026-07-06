// Logika zadań okresowych — współdzielona przez instrumentation.ts (długożyjący
// proces: dev/Docker) oraz endpointy Vercel Cron (serverless: app/api/cron/*).

import { prisma } from "./db";
import { syncIcalFeed } from "./ical";

/** Anuluje nieopłacone rezerwacje PENDING po upływie czasu na zaliczkę. */
export async function expireReservations(): Promise<number> {
  const { count } = await prisma.reservation.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "CANCELLED" },
  });
  if (count > 0) console.log(`[JOBS] wygaszono ${count} nieopłaconych rezerwacji`);
  return count;
}

/** Synchronizuje wszystkie kanały iCal (import zajętych terminów jako bloki). */
export async function syncAllIcalFeeds(): Promise<number> {
  const feeds = await prisma.icalFeed.findMany();
  for (const feed of feeds) await syncIcalFeed(feed);
  if (feeds.length > 0)
    console.log(`[JOBS] zsynchronizowano ${feeds.length} kalendarzy iCal`);
  return feeds.length;
}
