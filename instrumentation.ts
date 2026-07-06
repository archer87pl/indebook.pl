// Zadania w tle uruchamiane raz przy starcie serwera (Next.js instrumentation).

const EXPIRE_INTERVAL_MS = 10 * 60 * 1000; // wygaszanie PENDING co 10 min
const ICAL_INTERVAL_MS = 60 * 60 * 1000; // sync iCal co godzinę

const flag = globalThis as unknown as { __hostimoJobs?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (flag.__hostimoJobs) return;
  flag.__hostimoJobs = true;

  const { prisma } = await import("./lib/db");
  const { syncIcalFeed } = await import("./lib/ical");

  setInterval(async () => {
    try {
      const { count } = await prisma.reservation.updateMany({
        where: { status: "PENDING", expiresAt: { lt: new Date() } },
        data: { status: "CANCELLED" },
      });
      if (count > 0) console.log(`[JOBS] wygaszono ${count} nieopłaconych rezerwacji`);
    } catch (e) {
      console.error("[JOBS] błąd wygaszania rezerwacji:", e);
    }
  }, EXPIRE_INTERVAL_MS).unref();

  setInterval(async () => {
    try {
      const feeds = await prisma.icalFeed.findMany();
      for (const feed of feeds) await syncIcalFeed(feed);
      if (feeds.length > 0)
        console.log(`[JOBS] zsynchronizowano ${feeds.length} kalendarzy iCal`);
    } catch (e) {
      console.error("[JOBS] błąd synchronizacji iCal:", e);
    }
  }, ICAL_INTERVAL_MS).unref();
}
