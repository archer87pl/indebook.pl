// Logika zadań okresowych — współdzielona przez instrumentation.ts (długożyjący
// proces: dev/Docker) oraz endpointy Vercel Cron (serverless: app/api/cron/*).

import { CHECKIN_RETENTION_DAYS, checkInUrl } from "./checkin";
import { addDaysISO, todayISO } from "./dates";
import { prisma } from "./db";
import { syncIcalFeed } from "./ical";
import { sendMail } from "./mailer";
import { appUrl } from "./payments";
import { reviewUrl } from "./reviews";
import { sendSms } from "./sms";

/** Anuluje nieopłacone rezerwacje PENDING po upływie czasu na zaliczkę. */
export async function expireReservations(): Promise<number> {
  const { count } = await prisma.reservation.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "CANCELLED" },
  });
  if (count > 0) console.log(`[JOBS] wygaszono ${count} nieopłaconych rezerwacji`);
  return count;
}

/**
 * Przypomnienie o jutrzejszym przyjeździe: e-mail + SMS (gdy jest numer),
 * z linkiem do meldunku online, jeśli jeszcze niewypełniony. Idempotentne
 * (flaga arrivalReminderAt), więc można wołać dowolnie często.
 */
export async function sendArrivalReminders(): Promise<number> {
  // nie budzimy gości — wysyłka tylko w godzinach 8–21
  const hour = new Date().getHours();
  if (hour < 8 || hour >= 21) return 0;

  const tomorrow = addDaysISO(todayISO(), 1);
  const due = await prisma.reservation.findMany({
    where: { status: "CONFIRMED", checkIn: tomorrow, arrivalReminderAt: null },
    include: { unit: { include: { unitType: { include: { property: true } } } } },
  });
  for (const r of due) {
    const property = r.unit.unitType.property;
    const needsCheckIn = r.checkInStatus === "NONE";
    if (r.email && !r.email.endsWith("@rezio.local")) {
      await sendMail({
        to: r.email,
        subject: `Do zobaczenia jutro — ${property.name}`,
        body: `Przypominamy o jutrzejszym przyjeździe do ${property.name} (zameldowanie od ${property.checkInFrom}).${
          needsCheckIn
            ? `\n\nWypełnij meldunek online — po wypełnieniu otrzymasz instrukcje przyjazdu:\n${checkInUrl(r.code)}`
            : property.arrivalInfo
              ? `\n\nInformacje na przyjazd:\n${property.arrivalInfo}`
              : ""
        }\n\nSzczegóły rezerwacji: ${appUrl()}/r/${r.code}`,
      });
    }
    if (r.phone) {
      await sendSms({
        to: r.phone,
        body: `Przypomnienie: jutro przyjazd do ${property.name} (od ${property.checkInFrom}).${
          needsCheckIn
            ? ` Meldunek online: ${checkInUrl(r.code)}`
            : ` Rezerwacja: ${appUrl()}/r/${r.code}`
        }`,
      });
    }
    await prisma.reservation.update({
      where: { id: r.id },
      data: { arrivalReminderAt: new Date() },
    });
  }
  if (due.length > 0)
    console.log(`[JOBS] wysłano ${due.length} przypomnień o przyjeździe`);
  return due.length;
}

/**
 * Prośba o opinię dzień po wymeldowaniu: e-mail + SMS (gdy jest numer),
 * z linkiem do formularza opinii. Idempotentne (flaga reviewRequestedAt).
 * Zakres = wczorajsze wymeldowania, żeby pierwszy bieg nie zalał historii.
 */
export async function sendReviewRequests(): Promise<number> {
  const hour = new Date().getHours();
  if (hour < 8 || hour >= 21) return 0;

  const yesterday = addDaysISO(todayISO(), -1);
  const due = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      checkOut: yesterday,
      reviewRequestedAt: null,
      review: null,
    },
    include: { unit: { include: { unitType: { include: { property: true } } } } },
  });
  for (const r of due) {
    const property = r.unit.unitType.property;
    if (r.email && !r.email.endsWith("@rezio.local")) {
      await sendMail({
        to: r.email,
        subject: `Jak minął pobyt w ${property.name}?`,
        body: `Dziękujemy za pobyt w ${property.name}!\n\nPodziel się krótką opinią — zajmie to chwilę i pomoże innym gościom:\n${reviewUrl(r.code)}`,
      });
    }
    if (r.phone) {
      await sendSms({
        to: r.phone,
        body: `Dziekujemy za pobyt w ${property.name}! Ocen pobyt: ${reviewUrl(r.code)}`,
      });
    }
    await prisma.reservation.update({
      where: { id: r.id },
      data: { reviewRequestedAt: new Date() },
    });
  }
  if (due.length > 0)
    console.log(`[JOBS] wysłano ${due.length} próśb o opinię`);
  return due.length;
}

/**
 * Retencja RODO: kasuje karty meldunkowe (PII) po CHECKIN_RETENTION_DAYS od
 * wymeldowania. Badge checkInStatus na rezerwacji zostaje jako historia.
 */
export async function purgeExpiredCheckIns(): Promise<number> {
  const cutoff = addDaysISO(todayISO(), -CHECKIN_RETENTION_DAYS);
  const { count } = await prisma.checkInCard.deleteMany({
    where: { reservation: { checkOut: { lt: cutoff } } },
  });
  if (count > 0)
    console.log(`[JOBS] usunięto ${count} kart meldunkowych po okresie retencji`);
  return count;
}

/**
 * Retencja artefaktów uwierzytelniania: kasuje wygasłe sesje i tokeny resetu
 * hasła. `getSessionUser` tylko ignoruje wygasłe sesje, więc bez tego tabela
 * `Session` rosłaby monotonicznie z każdym logowaniem.
 */
export async function purgeExpiredSessions(): Promise<number> {
  const now = new Date();
  const [sessions] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  if (sessions.count > 0)
    console.log(`[JOBS] usunięto ${sessions.count} wygasłych sesji`);
  return sessions.count;
}

/** Kasuje wygasłe okna rate-limitera (retencja licznika). */
export async function purgeExpiredRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date() } },
  });
  return count;
}

/** Retencja dziennika zdarzeń: wpisy starsze niż 90 dni są kasowane. */
export async function purgeOldEventLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const { count } = await prisma.eventLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (count > 0)
    console.log(`[JOBS] usunięto ${count} starych wpisów dziennika zdarzeń`);
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
