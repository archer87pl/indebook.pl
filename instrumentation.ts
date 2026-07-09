// Zadania w tle uruchamiane raz przy starcie serwera (Next.js instrumentation).
//
// Działa tylko przy długożyjącym procesie (dev, `next start`, Docker). Na Vercel
// (serverless, brak stałego procesu) te same zadania odpalają endpointy Vercel
// Cron — patrz app/api/cron/* oraz vercel.json — dlatego tam pętle pomijamy.

const EXPIRE_INTERVAL_MS = 10 * 60 * 1000; // wygaszanie PENDING co 10 min
const ICAL_INTERVAL_MS = 60 * 60 * 1000; // sync iCal co godzinę
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // retencja kart meldunkowych raz dziennie
const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // przypomnienia o przyjeździe co godzinę (idempotentne, 8–21)
const REVIEW_INTERVAL_MS = 60 * 60 * 1000; // prośby o opinię co godzinę (idempotentne, 8–21)

const flag = globalThis as unknown as { __rezioJobs?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return; // na Vercel zadania odpala Cron, nie setInterval
  if (flag.__rezioJobs) return;
  flag.__rezioJobs = true;

  const {
    expireReservations,
    purgeExpiredCheckIns,
    sendArrivalReminders,
    sendReviewRequests,
    syncAllIcalFeeds,
  } = await import("./lib/jobs");

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

  setInterval(() => {
    purgeExpiredCheckIns().catch((e) =>
      console.error("[JOBS] błąd retencji kart meldunkowych:", e),
    );
  }, PURGE_INTERVAL_MS).unref();

  setInterval(() => {
    sendArrivalReminders().catch((e) =>
      console.error("[JOBS] błąd przypomnień o przyjeździe:", e),
    );
  }, REMINDER_INTERVAL_MS).unref();

  setInterval(() => {
    sendReviewRequests().catch((e) =>
      console.error("[JOBS] błąd próśb o opinię:", e),
    );
  }, REVIEW_INTERVAL_MS).unref();
}
