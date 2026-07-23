import {
  expireReservations,
  purgeExpiredCheckIns,
  purgeExpiredSessions,
  purgeOldEventLogs,
  purgeExpiredRateLimits,
  sendArrivalReminders,
  sendReviewRequests,
} from "@/lib/jobs";
import { safeEqual } from "@/lib/password";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Wywoływane przez Vercel Cron (harmonogram w vercel.json). Vercel dołącza
// nagłówek Authorization: Bearer <CRON_SECRET> — odrzucamy obce żądania.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // fail-closed: bez skonfigurowanego sekretu endpoint jest niedostępny
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const count = await expireReservations();
  // Vercel Hobby: maks. 2 crony — pozostałe dzienne zadania robimy przy okazji
  const purged = await purgeExpiredCheckIns();
  const purgedSessions = await purgeExpiredSessions();
  const purgedLogs = await purgeOldEventLogs();
  await purgeExpiredRateLimits();
  const reminders = await sendArrivalReminders();
  const reviewRequests = await sendReviewRequests();
  return Response.json({
    ok: true,
    expired: count,
    purgedCheckIns: purged,
    purgedSessions,
    purgedEventLogs: purgedLogs,
    arrivalReminders: reminders,
    reviewRequests,
  });
}
