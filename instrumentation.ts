// Zadania w tle uruchamiane raz przy starcie serwera (Next.js instrumentation).
//
// Działa tylko przy długożyjącym procesie (dev, `next start`, Docker). Na Vercel
// (serverless, brak stałego procesu) te same zadania odpalają endpointy Vercel
// Cron — patrz app/api/cron/* oraz vercel.json — dlatego tam pętle pomijamy.

const EXPIRE_INTERVAL_MS = 10 * 60 * 1000; // wygaszanie PENDING co 10 min
const ICAL_INTERVAL_MS = 60 * 60 * 1000; // sync iCal co godzinę

const flag = globalThis as unknown as { __noteloJobs?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return; // na Vercel zadania odpala Cron, nie setInterval
  if (flag.__noteloJobs) return;
  flag.__noteloJobs = true;

  const { expireReservations, syncAllIcalFeeds } = await import("./lib/jobs");

  setInterval(() => {
    expireReservations().catch((e) =>
      console.error("[JOBS] błąd wygaszania rezerwacji:", e),
    );
  }, EXPIRE_INTERVAL_MS).unref();

  setInterval(() => {
    syncAllIcalFeeds().catch((e) =>
      console.error("[JOBS] błąd synchronizacji iCal:", e),
    );
  }, ICAL_INTERVAL_MS).unref();
}
