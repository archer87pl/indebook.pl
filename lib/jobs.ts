// Logika zadań okresowych — współdzielona przez instrumentation.ts (długożyjący
// proces: dev/Docker) oraz endpointy Vercel Cron (serverless: app/api/cron/*).

import { CHECKIN_RETENTION_DAYS, checkInUrl } from "./checkin";
import { addDaysISO, todayISO } from "./dates";
import { prisma } from "./db";
import { syncIcalFeed } from "./ical";
import { guestT } from "./guest-mail";
import { processOutbox } from "./channex/outbox";
import { refreshRates } from "./rates/refresh";
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
    const t = await guestT(r.locale);
    if (r.email && !r.email.endsWith("@rezflow.local")) {
      await sendMail({
        to: r.email,
        subject: t("arrivalReminder.subject", { property: property.name }),
        // dopiski (meldunek / informacje na przyjazd / link) nie mają kluczy
        // w katalogu — doklejamy je do przetłumaczonej treści bazowej
        body: `${t("arrivalReminder.body", {
          property: property.name,
          checkInFrom: property.checkInFrom,
        })}${
          needsCheckIn
            ? `\n\n${checkInUrl(r.code)}`
            : property.arrivalInfo
              ? `\n\n${property.arrivalInfo}`
              : ""
        }\n\n${appUrl()}/r/${r.code}`,
      });
    }
    if (r.phone) {
      await sendSms({
        to: r.phone,
        body: `${t("sms.arrivalReminder", {
          property: property.name,
          checkInFrom: property.checkInFrom,
        })}${
          needsCheckIn
            ? ` ${checkInUrl(r.code)}`
            : ` ${appUrl()}/r/${r.code}`
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
    const t = await guestT(r.locale);
    if (r.email && !r.email.endsWith("@rezflow.local")) {
      await sendMail({
        to: r.email,
        subject: t("reviewRequest.subject", { property: property.name }),
        body: t("reviewRequest.body", {
          property: property.name,
          reviewUrl: reviewUrl(r.code),
        }),
      });
    }
    if (r.phone) {
      await sendSms({
        to: r.phone,
        body: t("sms.reviewRequest", {
          property: property.name,
          reviewUrl: reviewUrl(r.code),
        }),
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

/** Przetwarza zaległe zadania ARI (Channex) dla wszystkich aktywnych obiektów. */
export async function processAllChannexOutbox(): Promise<number> {
  const active = await prisma.channexProperty.findMany({
    where: { status: "ACTIVE" },
    select: { propertyId: true },
  });
  let total = 0;
  for (const cp of active) {
    const { sent } = await processOutbox(cp.propertyId);
    total += sent;
  }
  return total;
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

/**
 * Odbudowa horyzontu rekomendacji (180 dni) dla obiektów w trybie SMARTRATE.
 *
 * Pracuje w budżecie czasu i zaczyna od najdawniej odświeżanych typów pokoi,
 * więc przy dużej liczbie obiektów kolejne przebiegi domykają resztę zamiast
 * w kółko odświeżać ten sam początek listy. Bez tego cron po prostu wpadał
 * w timeout funkcji i cicho gubił ogon listy.
 */
export function byStalestFirst<T extends { dynamicRates: { fetchedAt: Date }[] }>(
  types: T[]
): T[] {
  // typy bez ani jednej rekomendacji mają pierwszeństwo (brak = epoka zero)
  return [...types].sort(
    (a, b) =>
      (a.dynamicRates[0]?.fetchedAt.getTime() ?? 0) -
      (b.dynamicRates[0]?.fetchedAt.getTime() ?? 0)
  );
}

export async function refreshAllRates(
  budgetMs = 240_000
): Promise<{ days: number; unitTypes: number; pending: number }> {
  const startedAt = Date.now();
  const from = todayISO();
  const to = addDaysISO(from, 180);

  // NULLS FIRST: typy bez ani jednej rekomendacji mają pierwszeństwo
  const types = byStalestFirst(
    await prisma.unitType.findMany({
      where: { property: { pricingMode: "SMARTRATE" } },
      select: {
        id: true,
        dynamicRates: {
          select: { fetchedAt: true },
          orderBy: { fetchedAt: "desc" },
          take: 1,
        },
      },
    })
  );

  let days = 0;
  let processed = 0;
  for (const t of types) {
    if (Date.now() - startedAt > budgetMs) break;
    days += await refreshRates(t.id, from, to);
    processed++;
  }
  return { days, unitTypes: processed, pending: types.length - processed };
}
